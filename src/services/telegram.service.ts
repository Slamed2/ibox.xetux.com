import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';
import {
  ALL_DEPT_BUTTONS,
  ALL_COUNTRY_BUTTONS,
  DIRECT_DEPARTMENTS,
  NEEDS_COUNTRY,
  DEPT_COUNTRY_TEAMS,
  COUNTRY_KEYBOARD,
  DEPARTMENT_KEYBOARD,
} from './department-menu.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Track pending department selection per user (waiting for country)
const pendingDepartment = new Map<number, string>();

// /start command — greeting is handled by Chatwoot conversation_created flow
bot.command('start', async (ctx) => {
  await withExecutionLog(
    {
      eventType: 'telegram:command_start',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from, text: ctx.message?.text },
      contactId: String(ctx.from?.id),
      metadata: { chatType: ctx.chat.type, username: ctx.from?.username ?? null },
    },
    async () => {
      return { handled: 'deferred_to_chatwoot_conversation_created' };
    },
  );
});

// Handle all messages — check for department/country button presses
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Check if it's a department button
  if (ALL_DEPT_BUTTONS.has(text)) {
    await withExecutionLog(
      {
        eventType: 'telegram:dept_selection',
        source: 'telegram_webhook',
        direction: 'inbound',
        inputData: { userId, text },
        contactId: String(userId),
        metadata: { selection: text },
      },
      async () => {
        // Direct department — assign immediately
        if (DIRECT_DEPARTMENTS[text]) {
          const { teamId, label } = DIRECT_DEPARTMENTS[text];
          return await assignTeamAndConfirm(ctx, userId, teamId, label);
        }

        // Department needs country — show country keyboard
        if (NEEDS_COUNTRY.has(text)) {
          pendingDepartment.set(userId, text);
          await ctx.reply(`Has seleccionado ${text}.\n\n¿En qué país te encuentras?`, {
            reply_markup: COUNTRY_KEYBOARD,
          });
          return { action: 'country_menu_shown', department: text };
        }

        return { action: 'unknown_dept', text };
      },
    );
    return;
  }

  // Check if it's a country button (user has a pending department)
  if (ALL_COUNTRY_BUTTONS.has(text) && pendingDepartment.has(userId)) {
    await withExecutionLog(
      {
        eventType: 'telegram:country_selection',
        source: 'telegram_webhook',
        direction: 'inbound',
        inputData: { userId, text, pendingDept: pendingDepartment.get(userId) },
        contactId: String(userId),
        metadata: { country: text, department: pendingDepartment.get(userId) },
      },
      async () => {
        const dept = pendingDepartment.get(userId)!;
        pendingDepartment.delete(userId);

        const countryMap = DEPT_COUNTRY_TEAMS[dept];
        if (countryMap?.[text]) {
          const { teamId, label } = countryMap[text];
          return await assignTeamAndConfirm(ctx, userId, teamId, label);
        }

        await ctx.reply('Opción no reconocida.', { reply_markup: DEPARTMENT_KEYBOARD });
        return { action: 'unknown_country', text, dept };
      },
    );
    return;
  }

  // Regular message — just log it
  await withExecutionLog(
    {
      eventType: 'telegram:message',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from, messageId: ctx.message.message_id, text },
      contactId: String(userId),
      metadata: { chatType: ctx.chat.type, username: ctx.from?.username ?? null },
    },
    async () => {
      return { messageId: ctx.message.message_id, text };
    },
  );
});

// Handle non-text messages
bot.on('message', async (ctx) => {
  await withExecutionLog(
    {
      eventType: 'telegram:message',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from, messageId: ctx.message.message_id },
      contactId: String(ctx.from?.id),
      metadata: { chatType: ctx.chat.type, contentType: 'non_text' },
    },
    async () => {
      return { messageId: ctx.message.message_id };
    },
  );
});

/**
 * Assign team in Chatwoot and send confirmation to user.
 */
async function assignTeamAndConfirm(ctx: any, telegramUserId: number, teamId: number, teamLabel: string) {
  const conversationId = await chatwootService.findConversationByTelegramUserId(telegramUserId);

  if (conversationId) {
    await chatwootService.assignConversation(conversationId, { team_id: teamId });

    await chatwootService.sendMessage(conversationId, {
      content: `📌 Departamento seleccionado: ${teamLabel}`,
      message_type: 'outgoing',
    });
  } else {
    logger.warn({ telegramUserId }, 'No Chatwoot conversation found for team assignment');
  }

  await ctx.reply(`✅ Tu conversación fue asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.`, {
    parse_mode: 'Markdown',
    reply_markup: DEPARTMENT_KEYBOARD,
  });

  return { action: 'team_assigned', teamId, teamLabel, conversationId };
}

// Handle errors
bot.catch((err) => {
  logger.error({ error: err.message }, 'Grammy bot error');
});

export async function setupTelegramWebhook(webhookUrl: string) {
  await bot.api.setWebhook(webhookUrl, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
  });
  logger.info({ webhookUrl }, 'Telegram webhook configured');
}

/**
 * Send a message via grammY and sync to Chatwoot with the message_id.
 */
export async function sendTelegramMessage(chatId: number | string, text: string) {
  const result = await bot.api.sendMessage(chatId, text);
  chatwootService.sendMessageByTelegramUserId(
    Number(chatId),
    text,
    result.message_id,
  ).catch((err) => {
    logger.error({ err: err.message }, 'Failed to sync Telegram message to Chatwoot');
  });
  return result;
}
