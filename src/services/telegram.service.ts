import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

const WELCOME_MESSAGE = '¡Hola! 👋 Bienvenido a nuestro servicio de atención.\n\n' +
  'Escribe tu consulta y un agente te atenderá lo antes posible.';

// /start command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat.id;

  await withExecutionLog(
    {
      eventType: 'telegram:start_command',
      source: 'telegram_webhook',
      direction: 'inbound',
      inputData: { chatId, userId, from: ctx.from },
      contactId: String(userId),
    },
    async () => {
      await ctx.reply(WELCOME_MESSAGE);

      // Wait for Chatwoot to process the forwarded webhook and create the conversation
      await delay(3000);

      // Sync the bot reply to Chatwoot
      const synced = await chatwootService.sendMessageByTelegramUserId(userId!, WELCOME_MESSAGE);

      return { replied: true, syncedToChatwoot: synced };
    },
  );
});

// Log all other messages
bot.on('message', async (ctx) => {
  const userId = ctx.from?.id;
  logger.info({ chatId: ctx.chat.id, userId, text: ctx.message.text }, 'Telegram message received');
});

// Handle errors
bot.catch((err) => {
  logger.error({ error: err.message }, 'Grammy bot error');
});

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  chatwootService.sendMessageByTelegramUserId(Number(chatId), text).catch((err) => {
    logger.error({ err: err.message }, 'Failed to sync Telegram message to Chatwoot');
  });
  return result;
}
