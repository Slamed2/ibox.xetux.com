import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';

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
      // Don't reply here — the greeting.flow.ts handles it when Chatwoot creates the conversation
      return { handled: 'deferred_to_chatwoot_conversation_created' };
    },
  );
});

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
