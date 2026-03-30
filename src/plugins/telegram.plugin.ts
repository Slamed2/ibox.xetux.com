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
    const update = request.body as any;
    const msg = update?.message ?? update?.edited_message;
    logger.debug({
      updateId: update?.update_id,
      chatType: msg?.chat?.type,
      chatId: msg?.chat?.id,
      fromId: msg?.from?.id,
      text: msg?.text?.substring(0, 50),
      hasMessage: !!update?.message,
      hasEditedMessage: !!update?.edited_message,
    }, 'Telegram webhook received');

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
 * Transform group/supergroup messages to look like private messages for Chatwoot.
 * The original body is NOT mutated — grammY needs it intact.
 */
function transformGroupMessage(body: unknown): unknown {
  const update = body as any;
  const msg = update?.message ?? update?.edited_message;
  if (!msg?.chat) return body;

  const chatType = msg.chat.type;
  if (chatType !== 'group' && chatType !== 'supergroup') return body;

  const transformed = JSON.parse(JSON.stringify(body));
  const tMsg = transformed.message ?? transformed.edited_message;

  const senderName = tMsg.from?.first_name ?? tMsg.from?.username ?? 'Unknown';
  const groupTitle = tMsg.chat.title ?? 'Sin nombre';

  // Make it look like a private chat but keep group ID for responses
  tMsg.chat.type = 'private';
  tMsg.chat.first_name = `Grupo ${groupTitle}`;
  delete tMsg.chat.title;

  // Prefix message with sender name
  if (tMsg.text) {
    tMsg.text = `${senderName}: ${tMsg.text}`;
  }
  if (tMsg.caption) {
    tMsg.caption = `${senderName}: ${tMsg.caption}`;
  }

  return transformed;
}

/**
 * Forward Telegram webhook payload to Chatwoot (fire-and-forget)
 */
function forwardToChatwoot(body: unknown, chatwootUrl: string) {
  const transformed = transformGroupMessage(body);
  axios.post(chatwootUrl, transformed, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
  }).then(() => {
    logger.debug('Forwarded Telegram update to Chatwoot');
  }).catch((err) => {
    logger.error({ err: err.message, url: chatwootUrl }, 'Failed to forward to Chatwoot');
  });
}
