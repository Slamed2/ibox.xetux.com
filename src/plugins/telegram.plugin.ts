import { FastifyPluginAsync } from 'fastify';
import { webhookCallback } from 'grammy';
import axios from 'axios';
import { bot, setupTelegramWebhook } from '../services/telegram.service.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export const telegramPlugin: FastifyPluginAsync = async (fastify) => {
  // Register webhook route with secret path
  const webhookPath = `/telegram/${config.TELEGRAM_WEBHOOK_SECRET}`;

  // Chatwoot's Telegram webhook URL
  const chatwootTelegramWebhook = `${config.CHATWOOT_BASE_URL}/webhooks/telegram/${config.TELEGRAM_BOT_TOKEN}`;

  fastify.post(webhookPath, async (request, reply) => {
    // 1. Forward to Chatwoot first (fire-and-forget so it creates the conversation)
    forwardToChatwoot(request.body, chatwootTelegramWebhook);

    // 2. Process with grammY (our bot logic)
    const handler = webhookCallback(bot, 'fastify', {
      secretToken: config.TELEGRAM_WEBHOOK_SECRET,
    });
    return handler(request, reply);
  });

  // Set webhook URL on startup (only in production or if explicitly enabled)
  fastify.addHook('onReady', async () => {
    if (config.NODE_ENV === 'production') {
      const baseUrl = process.env.WEBHOOK_BASE_URL ?? `https://ibox.xetux.com`;
      const fullUrl = `${baseUrl}/webhook${webhookPath}`;
      try {
        await setupTelegramWebhook(fullUrl);
      } catch (err) {
        logger.error({ err }, 'Failed to set Telegram webhook');
      }
    } else {
      logger.info('Skipping Telegram webhook setup in development mode');
    }
  });
};

/**
 * Forward Telegram webhook payload to Chatwoot (fire-and-forget)
 */
function forwardToChatwoot(body: unknown, chatwootUrl: string) {
  axios.post(chatwootUrl, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
  }).then(() => {
    logger.debug('Forwarded Telegram update to Chatwoot');
  }).catch((err) => {
    logger.error({ err: err.message, url: chatwootUrl }, 'Failed to forward to Chatwoot');
  });
}
