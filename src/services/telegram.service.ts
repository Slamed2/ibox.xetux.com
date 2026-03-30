import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';
import { db } from '../db/connection.js';
import { botConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { BOT_COMMANDS, GUEST_COMMANDS } from './department-menu.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

/**
 * grammY API transformer: rewrite chat_id in outgoing API calls
 * when a group→supergroup migration is known.
 * Without this, ctx.reply() uses the old group ID from the original update,
 * which Telegram rejects with "group chat was upgraded to supergroup chat".
 */
bot.api.config.use((prev, method, payload, signal) => {
  if (payload && typeof payload === 'object' && 'chat_id' in payload) {
    const chatId = (payload as any).chat_id;
    if (typeof chatId === 'number' && chatId < 0) {
      const migrated = getMigratedGroupId(chatId);
      if (migrated !== chatId) {
        logger.debug({ method, oldChatId: chatId, newChatId: migrated }, 'API transformer: rewriting migrated chat_id');
        (payload as any).chat_id = migrated;
      }
    }
  }
  return prev(method, payload, signal);
});

// ─── Group migration infrastructure ─────────────────────────────────────────

const groupMigrations = new Map<number, number>();
const DB_KEY = 'group_migrations';

export async function loadGroupMigrations(): Promise<void> {
  try {
    const row = await db.select().from(botConfig).where(eq(botConfig.key, DB_KEY)).limit(1);
    if (row.length > 0) {
      const map = row[0].value as Record<string, number>;
      for (const [oldId, newId] of Object.entries(map)) {
        groupMigrations.set(Number(oldId), newId);
      }
      logger.info({ count: groupMigrations.size, migrations: map }, 'Group migrations loaded from DB');
    } else {
      logger.info('No group migrations found in DB');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to load group migrations from DB');
  }
}

async function saveGroupMigrations(): Promise<void> {
  try {
    const map: Record<string, number> = {};
    for (const [oldId, newId] of groupMigrations) {
      map[String(oldId)] = newId;
    }
    const existing = await db.select().from(botConfig).where(eq(botConfig.key, DB_KEY)).limit(1);
    if (existing.length > 0) {
      await db.update(botConfig).set({ value: map, updatedAt: new Date() }).where(eq(botConfig.key, DB_KEY));
    } else {
      await db.insert(botConfig).values({ key: DB_KEY, value: map, description: 'Telegram group→supergroup migration map' });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to save group migrations to DB');
  }
}

export function registerGroupMigration(oldId: number, newId: number): void {
  groupMigrations.set(oldId, newId);
  logger.info({ oldId, newId }, 'Group migration registered');
  saveGroupMigrations();
}

export function getMigratedGroupId(chatId: number): number {
  return groupMigrations.get(chatId) ?? chatId;
}

// ─── Bot assignment tracking ─────────────────────────────────────────────────

const recentBotAssignments = new Map<number, number>();

export function markBotAssignment(conversationId: number): void {
  recentBotAssignments.set(conversationId, Date.now());
}

export function wasBotAssignment(conversationId: number): boolean {
  const ts = recentBotAssignments.get(conversationId);
  if (!ts) return false;
  if (Date.now() - ts > 10_000) {
    recentBotAssignments.delete(conversationId);
    return false;
  }
  // Don't consume — multiple webhooks may fire for a single assignment
  // (team change + assignee change + labels). The 10s TTL handles cleanup.
  return true;
}

// ─── Deep link pending storage ───────────────────────────────────────────────

const pendingDeepLinkXetuxIds = new Map<number, { xetuxId: string; timestamp: number }>();

export function setPendingDeepLinkXetuxId(telegramUserId: number, xetuxId: string): void {
  pendingDeepLinkXetuxIds.set(telegramUserId, { xetuxId, timestamp: Date.now() });
}

export function consumePendingDeepLinkXetuxId(telegramUserId: number): string | null {
  const entry = pendingDeepLinkXetuxIds.get(telegramUserId);
  if (!entry) return null;
  pendingDeepLinkXetuxIds.delete(telegramUserId);
  if (Date.now() - entry.timestamp > 30_000) return null;
  return entry.xetuxId;
}

// ─── Thin grammY handlers ────────────────────────────────────────────────────

// /start — only handles deep link parsing, greeting is deferred to Chatwoot flow
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
      // Deep link: /start XETUXID-VE00029 or XETUXID_MX00023
      const match = text.match(/XETUXID[-_]+([A-Za-z]{2}\d{5})/);
      if (match && userId) {
        const xetuxId = match[1].toUpperCase();
        setPendingDeepLinkXetuxId(userId, xetuxId);
        logger.info({ userId, xetuxId }, 'Deep link xetux_id stored, waiting for conversation_created');
        return { action: 'deep_link_pending', xetuxId };
      }
      return { handled: 'deferred_to_chatwoot_conversation_created' };
    },
  );
});

// Callback queries — only ACK + remove buttons. Business logic in routing.flow.ts
bot.on('callback_query:data', async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.callbackQuery.data.startsWith('team:')) {
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch {
      // Message may have been deleted or already edited
    }
  }
});

// Edited messages — sync edits to Chatwoot (needs lookup, but edits are rare)
bot.on('edited_message:text', async (ctx) => {
  const userId = ctx.from?.id;
  const editedMsg = ctx.editedMessage;

  // Determine lookup ID for Chatwoot
  const chat = ctx.chat;
  const lookupId = (chat?.id && chat.id < 0)
    ? getMigratedGroupId(chat.id)
    : (ctx.from?.id ?? 0);

  await withExecutionLog(
    {
      eventType: 'telegram:message_edited',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { userId, messageId: editedMsg.message_id, text: editedMsg.text },
      contactId: String(userId),
      metadata: { username: ctx.from?.username ?? null, chatType: ctx.chat?.type },
    },
    async () => {
      const conversationId = await chatwootService.findConversationByTelegramUserId(lookupId);
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

// Non-text messages — log only
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

// Error handler — detect group migrations from API errors
bot.catch((err) => {
  const errMsg = (err as any)?.error?.message ?? err?.message ?? '';
  const migrateId = (err?.error as any)?.parameters?.migrate_to_chat_id;
  if (migrateId && err?.ctx?.chat?.id) {
    registerGroupMigration(err.ctx.chat.id, migrateId);
    logger.info({ oldId: err.ctx.chat.id, newId: migrateId }, 'Group migration detected from API error');
  }
  logger.error({ error: errMsg }, 'Grammy bot error');
});

// ─── Webhook setup ───────────────────────────────────────────────────────────

export async function setupTelegramWebhook(webhookUrl: string) {
  await loadGroupMigrations();

  await bot.api.deleteMyCommands({ scope: { type: 'default' } });
  await bot.api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
  await bot.api.deleteMyCommands({ scope: { type: 'all_group_chats' } });

  await bot.api.setMyCommands(GUEST_COMMANDS, { scope: { type: 'default' } });
  await bot.api.setMyCommands(GUEST_COMMANDS, { scope: { type: 'all_private_chats' } });
  await bot.api.setMyCommands(BOT_COMMANDS, { scope: { type: 'all_group_chats' } });
  logger.info('Default bot commands set to guest menu (registro only), full menu for groups');

  await bot.api.setWebhook(webhookUrl, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: [
      'message', 'edited_message', 'channel_post', 'edited_channel_post',
      'callback_query', 'inline_query', 'chosen_inline_result',
      'shipping_query', 'pre_checkout_query', 'poll', 'poll_answer',
      'my_chat_member', 'chat_member', 'chat_join_request',
      'message_reaction', 'message_reaction_count',
      'chat_boost', 'removed_chat_boost',
    ],
  });
  logger.info({ webhookUrl }, 'Telegram webhook configured');
}

// ─── Per-user command scopes ─────────────────────────────────────────────────

export async function enableUserCommands(telegramUserId: number) {
  if (telegramUserId < 0) {
    logger.debug({ telegramUserId }, 'Skipping enableUserCommands for group chat');
    return;
  }
  await bot.api.setMyCommands(BOT_COMMANDS, {
    scope: { type: 'chat', chat_id: telegramUserId },
  });
  logger.info({ telegramUserId }, 'Department commands enabled for user');
}

export async function resetUserCommands(telegramUserId: number) {
  if (telegramUserId < 0) {
    logger.debug({ telegramUserId }, 'Skipping resetUserCommands for group chat');
    return;
  }
  await bot.api.setMyCommands(GUEST_COMMANDS, {
    scope: { type: 'chat', chat_id: telegramUserId },
  });
  logger.info({ telegramUserId }, 'Commands reset to guest menu for user');
}

// ─── Utility ─────────────────────────────────────────────────────────────────

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
