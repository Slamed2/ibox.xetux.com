import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

const WELCOME_MESSAGE = '¡Hola! 👋 Bienvenido a nuestro servicio de atención.\n\n' +
  'Escribe tu consulta y un agente te atenderá lo antes posible.';

// /start command
bot.command('start', async (ctx) => {
  logger.info({ chatId: ctx.chat.id, from: ctx.from }, 'Telegram /start command');
  await ctx.reply(WELCOME_MESSAGE);

  // Sync reply to Chatwoot (with small delay to let Chatwoot create the conversation first)
  setTimeout(() => {
    syncBotReplyToChatwoot(ctx.chat.id, WELCOME_MESSAGE);
  }, 2000);
});

// Handle errors
bot.catch((err) => {
  logger.error({ error: err.message }, 'Grammy bot error');
});

/**
 * Sync a bot reply to Chatwoot so it appears in the conversation
 */
async function syncBotReplyToChatwoot(chatId: number, message: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const success = await chatwootService.sendMessageByTelegramChatId(chatId, message);
    if (success) return;

    // Chatwoot might not have created the conversation yet, wait and retry
    if (attempt < retries) {
      logger.debug({ chatId, attempt }, 'Conversation not found yet, retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  logger.warn({ chatId }, 'Could not sync bot reply to Chatwoot after retries');
}

export async function setupTelegramWebhook(webhookUrl: string) {
  await bot.api.setWebhook(webhookUrl, {
    secret_token: config.TELEGRAM_WEBHOOK_SECRET,
  });
  logger.info({ webhookUrl }, 'Telegram webhook configured');
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const result = await bot.api.sendMessage(chatId, text);
  // Also sync to Chatwoot
  syncBotReplyToChatwoot(Number(chatId), text).catch(() => {});
  return result;
}
