import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// /start command
bot.command('start', async (ctx) => {
  logger.info({ chatId: ctx.chat.id, from: ctx.from }, 'Telegram /start command');
  await ctx.reply(
    '¡Hola! 👋 Bienvenido a nuestro servicio de atención.\n\n' +
    'Escribe tu consulta y un agente te atenderá lo antes posible.',
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

export async function sendTelegramMessage(chatId: number | string, text: string) {
  return bot.api.sendMessage(chatId, text);
}
