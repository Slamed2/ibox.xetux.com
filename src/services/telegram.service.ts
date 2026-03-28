import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';
import { InlineKeyboard } from 'grammy';
import {
  DIRECT_COMMANDS,
  COUNTRY_COMMANDS,
  COUNTRY_KEYBOARD,
  COUNTRY_BUTTONS,
  BOT_COMMANDS,
  GUEST_COMMANDS,
  TEAM_LABELS,
} from './department-menu.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Track pending department selection per user (waiting for country)
const pendingDepartment = new Map<number, string>();

// Track recent bot-initiated team assignments to avoid duplicate notifications
// Key: conversationId, Value: timestamp — expires after 10 seconds
const recentBotAssignments = new Map<number, number>();

export function wasBotAssignment(conversationId: number): boolean {
  const ts = recentBotAssignments.get(conversationId);
  if (!ts) return false;
  if (Date.now() - ts > 10_000) {
    recentBotAssignments.delete(conversationId);
    return false;
  }
  recentBotAssignments.delete(conversationId);
  return true;
}

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

// /registro command — send login button
const WEBAPP_BASE_URL = (process.env.WEBHOOK_BASE_URL ?? 'https://xetux2-inbox.zbawxh.easypanel.host') + '/webapp';

bot.command('registro', async (ctx) => {
  const userId = ctx.from?.id;
  await withExecutionLog(
    {
      eventType: 'telegram:command_registro',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from },
      contactId: String(userId),
      metadata: { username: ctx.from?.username ?? null },
    },
    async () => {
      // Find conversation and contact in Chatwoot
      const conversationId = await chatwootService.findConversationByTelegramUserId(userId!);
      const conversation = conversationId ? await chatwootService.getConversation(conversationId) : null;
      const contactId = conversation?.contact?.id ?? conversation?.meta?.sender?.id ?? '';

      const webappUrl = `${WEBAPP_BASE_URL}?contact_id=${contactId}&conversation_id=${conversationId ?? ''}`;
      const keyboard = new InlineKeyboard().webApp('🔑 Iniciar sesión', webappUrl);

      await ctx.reply('Toca el botón para iniciar sesión:', { reply_markup: keyboard });
      return { action: 'registro_button_sent', conversationId, contactId };
    },
  );
});

// /consultoria command
bot.command('consultoria', async (ctx) => {
  await handleDepartmentCommand(ctx, 'consultoria', '💼 Consultoría');
});

// /soporte command
bot.command('soporte', async (ctx) => {
  await handleDepartmentCommand(ctx, 'soporte', '🛠 Soporte');
});

// /ventas command
bot.command('ventas', async (ctx) => {
  await handleDepartmentCommand(ctx, 'ventas', '🛒 Ventas');
});

// /administracion command
bot.command('administracion', async (ctx) => {
  await handleDepartmentCommand(ctx, 'administracion', '📋 Administración');
});

async function handleDepartmentCommand(ctx: any, command: string, displayName: string) {
  const userId = ctx.from.id;

  await withExecutionLog(
    {
      eventType: 'telegram:dept_command',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { userId, command },
      contactId: String(userId),
      metadata: { command, username: ctx.from?.username ?? null },
    },
    async () => {
      // Direct department — assign immediately
      if (DIRECT_COMMANDS[command]) {
        const { teamId, label } = DIRECT_COMMANDS[command];
        return await assignTeamAndConfirm(ctx, userId, teamId, label);
      }

      // Department needs country selection
      if (COUNTRY_COMMANDS[command]) {
        pendingDepartment.set(userId, command);
        await ctx.reply(`Has seleccionado ${displayName}.\n\n¿En qué país te encuentras?`, {
          reply_markup: COUNTRY_KEYBOARD,
        });
        return { action: 'country_menu_shown', department: command };
      }

      return { action: 'unknown_command', command };
    },
  );
}

// Handle text messages — check for country selection or regular message
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Check if it's a country button response
  if (COUNTRY_BUTTONS.has(text) && pendingDepartment.has(userId)) {
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

        const countryMap = COUNTRY_COMMANDS[dept];
        if (countryMap?.[text]) {
          const { teamId, label } = countryMap[text];
          return await assignTeamAndConfirm(ctx, userId, teamId, label);
        }

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

// Handle inline button callbacks (department selection after registration)
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  if (data.startsWith('team:')) {
    const parts = data.split(':');
    const teamId = parseInt(parts[1], 10);
    const teamLabel = parts[2] ?? '';

    await withExecutionLog(
      {
        eventType: 'telegram:dept_callback',
        source: 'telegram_webhook',
        direction: 'inbound',
        inputData: { userId, data },
        contactId: String(userId),
        metadata: { teamId, teamLabel, username: ctx.from?.username ?? null },
      },
      async () => {
        await ctx.answerCallbackQuery();

        const conversationId = await chatwootService.findConversationByTelegramUserId(userId);

        if (conversationId) {
          recentBotAssignments.set(conversationId, Date.now());
          await chatwootService.assignConversation(conversationId, { team_id: teamId });
          const teamLabelTag = TEAM_LABELS[teamId];
          if (teamLabelTag) {
            await chatwootService.addLabels(conversationId, [teamLabelTag]);
          }
        }

        // Edit the original message to show selection (remove buttons)
        await ctx.editMessageText(`✅ Conversación #${conversationId ?? ''} asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.`, {
          parse_mode: 'Markdown',
        });

        return { action: 'team_assigned_callback', teamId, teamLabel, conversationId };
      },
    );
    return;
  }

  await ctx.answerCallbackQuery();
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
    recentBotAssignments.set(conversationId, Date.now());
    await chatwootService.assignConversation(conversationId, { team_id: teamId });
    const teamLabelTag = TEAM_LABELS[teamId];
    if (teamLabelTag) {
      await chatwootService.addLabels(conversationId, [teamLabelTag]);
    }
  } else {
    logger.warn({ telegramUserId }, 'No Chatwoot conversation found for team assignment');
  }

  await ctx.reply(`✅ Conversación #${conversationId ?? ''} asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.`, {
    parse_mode: 'Markdown',
  });

  return { action: 'team_assigned', teamId, teamLabel, conversationId };
}

// Handle errors
bot.catch((err) => {
  logger.error({ error: err.message }, 'Grammy bot error');
});

export async function setupTelegramWebhook(webhookUrl: string) {
  // Default commands (for users who haven't registered yet)
  await bot.api.setMyCommands(GUEST_COMMANDS, { scope: { type: 'default' } });
  logger.info('Default bot commands set to guest menu (registro only)');

  await bot.api.setWebhook(webhookUrl, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
  });
  logger.info({ webhookUrl }, 'Telegram webhook configured');
}

/**
 * Enable department commands in the hamburger menu for a specific user.
 * Call this after registration.
 */
export async function enableUserCommands(telegramUserId: number) {
  await bot.api.setMyCommands(BOT_COMMANDS, {
    scope: { type: 'chat', chat_id: telegramUserId },
  });
  logger.info({ telegramUserId }, 'Department commands enabled for user');
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
