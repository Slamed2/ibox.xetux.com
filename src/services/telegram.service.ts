import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';
import {
  DIRECT_DEPARTMENTS,
  COUNTRY_DEPARTMENTS,
  DEPT_NAMES,
  countryKeyboard,
} from './department-menu.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

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

// Handle department menu callback queries
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  await withExecutionLog(
    {
      eventType: 'telegram:callback_query',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { userId, data, messageId: ctx.callbackQuery.message?.message_id },
      contactId: String(userId),
      metadata: { callbackData: data, username: ctx.from.username ?? null },
    },
    async () => {
      // Direct department (Ventas, Administración) — assign team immediately
      if (DIRECT_DEPARTMENTS[data]) {
        const { teamId, label } = DIRECT_DEPARTMENTS[data];
        return await assignTeamAndConfirm(ctx, userId, teamId, label);
      }

      // Department that needs country selection (Consultoría, Soporte)
      if (COUNTRY_DEPARTMENTS[data]) {
        const deptName = DEPT_NAMES[data] ?? data;
        await ctx.editMessageText(
          `Has seleccionado ${deptName}.\n\n¿En qué país te encuentras?`,
          { reply_markup: countryKeyboard(data) },
        );
        await ctx.answerCallbackQuery();
        return { action: 'country_menu_shown', department: data };
      }

      // Country selection (e.g., "dept:soporte|country:mx")
      if (data.includes('|country:')) {
        const [dept, country] = data.split('|');
        const countryMap = COUNTRY_DEPARTMENTS[dept];
        if (countryMap?.[country]) {
          const { teamId, label } = countryMap[country];
          return await assignTeamAndConfirm(ctx, userId, teamId, label);
        }
      }

      await ctx.answerCallbackQuery({ text: 'Opción no reconocida' });
      return { action: 'unknown_callback', data };
    },
  );
});

/**
 * Assign team in Chatwoot and send confirmation to user.
 */
async function assignTeamAndConfirm(
  ctx: any,
  telegramUserId: number,
  teamId: number,
  teamLabel: string,
) {
  // Find conversation in Chatwoot
  const conversationId = await chatwootService.findConversationByTelegramUserId(telegramUserId);

  if (conversationId) {
    await chatwootService.assignConversation(conversationId, { team_id: teamId });

    // Sync selection to Chatwoot
    const selectionText = `📌 Departamento seleccionado: ${teamLabel}`;
    await chatwootService.sendMessage(conversationId, {
      content: selectionText,
      message_type: 'outgoing',
    });
  } else {
    logger.warn({ telegramUserId }, 'No Chatwoot conversation found for team assignment');
  }

  // Update Telegram message with confirmation
  const confirmText = `✅ Tu conversación fue asignada a **${teamLabel}**.\n\nUn agente te atenderá pronto.`;
  await ctx.editMessageText(confirmText, { parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery({ text: `Asignado a ${teamLabel}` });

  return { action: 'team_assigned', teamId, teamLabel, conversationId };
}

// Log all other messages
bot.on('message', async (ctx) => {
  await withExecutionLog(
    {
      eventType: 'telegram:message',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from, messageId: ctx.message.message_id, text: ctx.message.text },
      contactId: String(ctx.from?.id),
      metadata: { chatType: ctx.chat.type, username: ctx.from?.username ?? null, contentType: ctx.message.text ? 'text' : 'other' },
    },
    async () => {
      return { messageId: ctx.message.message_id, text: ctx.message.text ?? null };
    },
  );
});

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
