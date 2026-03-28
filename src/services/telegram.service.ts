import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// /start command — greeting is handled by Chatwoot conversation_created flow
bot.command('start', async (ctx) => {
  logger.info({ chatId: ctx.chat.id, from: ctx.from }, 'Telegram /start command received');
  // Don't reply here — the greeting.flow.ts handles it when Chatwoot creates the conversation
});

// Log all other messages
bot.on('message', async (ctx) => {
  logger.info({ chatId: ctx.chat.id, userId: ctx.from?.id, text: ctx.message.text }, 'Telegram message received');
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
