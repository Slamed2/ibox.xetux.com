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

// Pending deep link xetux IDs — stored when /start arrives before conversation exists
const pendingDeepLinkXetuxIds = new Map<number, { xetuxId: string; timestamp: number }>();

export function setPendingDeepLinkXetuxId(telegramUserId: number, xetuxId: string): void {
  pendingDeepLinkXetuxIds.set(telegramUserId, { xetuxId, timestamp: Date.now() });
}

export function consumePendingDeepLinkXetuxId(telegramUserId: number): string | null {
  const entry = pendingDeepLinkXetuxIds.get(telegramUserId);
  if (!entry) return null;
  pendingDeepLinkXetuxIds.delete(telegramUserId);
  // Expire after 30 seconds
  if (Date.now() - entry.timestamp > 30_000) return null;
  return entry.xetuxId;
}

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
  const text = ctx.message?.text ?? '';
  const userId = ctx.from?.id;

  await withExecutionLog(
    {
      eventType: 'telegram:command_start',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId: ctx.chat.id, from: ctx.from, text },
      contactId: String(userId),
      metadata: { chatType: ctx.chat.type, username: ctx.from?.username ?? null },
    },
    async () => {
      // Check for deep link: /start XETUXID_VE-12345 (underscore separator, Telegram strips --)
      const match = text.match(/XETUXID_([A-Za-z0-9-]+)/);
      if (match && userId) {
        const xetuxId = match[1].toUpperCase();
        const isMX = xetuxId.startsWith('MX');
        const country = isMX ? 'Mexico' : 'Venezuela';
        const countryCode = isMX ? 'MX' : 'VE';

        // Find conversation and contact in Chatwoot
        const conversationId = await chatwootService.findConversationByTelegramUserId(userId);
        const conversation = conversationId ? await chatwootService.getConversation(conversationId) : null;
        const contactId = conversation?.contact?.id ?? conversation?.meta?.sender?.id;

        if (contactId) {
          // Update contact with xetux_id and country
          await chatwootService.updateContact(contactId, {
            additional_attributes: { country, country_code: countryCode },
            custom_attributes: { xetux_id: xetuxId },
          });

          // Add country label
          if (conversationId) {
            await chatwootService.addLabels(conversationId, [isMX ? 'mexico' : 'venezuela']);
          }

          // Enable department commands
          await enableUserCommands(userId);

          // Send internal note
          if (conversationId) {
            await chatwootService.sendMessage(conversationId, {
              content: `🔗 Xetux ID vinculado via deep link: ${xetuxId}`,
              private: true,
              message_type: 'outgoing',
            });
          }

          logger.info({ userId, xetuxId, contactId, conversationId }, 'Xetux ID updated via deep link');
          return { action: 'xetux_id_linked', xetuxId, contactId, conversationId };
        }

        // No conversation yet — store xetux_id for when conversation_created fires
        setPendingDeepLinkXetuxId(userId, xetuxId);
        logger.info({ userId, xetuxId }, 'Deep link xetux_id stored, waiting for conversation_created');
        return { action: 'deep_link_pending', xetuxId };
      }

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

      // Check if this is a new conversation (no messages yet or just the /start)
      const isNewConversation = conversation && !conversation.team_id && conversation.messages_count <= 2;

      if (isNewConversation) {
        // New conversation: include greeting + login button
        const greeting = '¡Bienvenido a Xetux! 🚀\n\nPara comenzar, inicia sesión tocando el botón de abajo.\nLuego usa el menú para seleccionar el departamento con el que deseas comunicarte.';
        const sentMsg = await ctx.reply(greeting, { reply_markup: keyboard });

        // Sync to Chatwoot
        if (conversationId) {
          await chatwootService.sendMessage(conversationId, {
            content: greeting + `\n\n🔗 [Iniciar sesión](${webappUrl})`,
            message_type: 'outgoing',
            source_id: String(sentMsg.message_id),
          });
        }

        return { action: 'registro_with_greeting', conversationId, contactId };
      }

      // Existing conversation: just the login button
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

        // Remove inline buttons from the original message (keep the text)
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });

        // Send confirmation as a separate message
        const confirmText = `✅ Conversación #${conversationId ?? ''} asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`;
        const sentMsg = await ctx.reply(confirmText, { parse_mode: 'Markdown' });

        // Sync confirmation to Chatwoot
        if (conversationId) {
          await chatwootService.sendMessage(conversationId, {
            content: `✅ Conversación #${conversationId} asignada a ${teamLabel}.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`,
            message_type: 'outgoing',
            source_id: String(sentMsg.message_id),
          });
        }

        return { action: 'team_assigned_callback', teamId, teamLabel, conversationId };
      },
    );
    return;
  }

  await ctx.answerCallbackQuery();
});

// Handle edited messages — sync edits to Chatwoot
bot.on('edited_message:text', async (ctx) => {
  const userId = ctx.from?.id;
  const editedMsg = ctx.editedMessage;

  await withExecutionLog(
    {
      eventType: 'telegram:message_edited',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { userId, messageId: editedMsg.message_id, text: editedMsg.text },
      contactId: String(userId),
      metadata: { username: ctx.from?.username ?? null },
    },
    async () => {
      const conversationId = await chatwootService.findConversationByTelegramUserId(userId!);
      if (!conversationId) return { action: 'no_conversation' };

      const chatwootMsg = await chatwootService.findMessageBySourceId(conversationId, String(editedMsg.message_id));
      if (chatwootMsg) {
        await chatwootService.updateMessage(conversationId, chatwootMsg.id, editedMsg.text ?? '');
        return { action: 'message_updated', chatwootMessageId: chatwootMsg.id };
      }

      return { action: 'message_not_found' };
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
    recentBotAssignments.set(conversationId, Date.now());
    await chatwootService.assignConversation(conversationId, { team_id: teamId });
    const teamLabelTag = TEAM_LABELS[teamId];
    if (teamLabelTag) {
      await chatwootService.addLabels(conversationId, [teamLabelTag]);
    }
  } else {
    logger.warn({ telegramUserId }, 'No Chatwoot conversation found for team assignment');
  }

  const confirmText = `✅ Conversación #${conversationId ?? ''} asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`;
  const sentMsg = await ctx.reply(confirmText, { parse_mode: 'Markdown' });

  if (conversationId) {
    await chatwootService.sendMessage(conversationId, {
      content: `✅ Conversación #${conversationId} asignada a ${teamLabel}.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`,
      message_type: 'outgoing',
      source_id: String(sentMsg.message_id),
    });
  }

  return { action: 'team_assigned', teamId, teamLabel, conversationId };
}

// Handle errors
bot.catch((err) => {
  logger.error({ error: err.message }, 'Grammy bot error');
});

export async function setupTelegramWebhook(webhookUrl: string) {
  // Clear all previous commands at every scope
  await bot.api.deleteMyCommands({ scope: { type: 'default' } });
  await bot.api.deleteMyCommands({ scope: { type: 'all_private_chats' } });

  // Set default commands (for users who haven't registered yet)
  await bot.api.setMyCommands(GUEST_COMMANDS, { scope: { type: 'default' } });
  await bot.api.setMyCommands(GUEST_COMMANDS, { scope: { type: 'all_private_chats' } });
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
