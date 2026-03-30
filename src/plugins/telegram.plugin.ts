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
 * Transform a single message object from group/supergroup to look like a private message.
 * Mutates the message in place — call on a deep clone only.
 */
function transformMessage(msg: any): void {
  if (!msg?.chat) return;

  const senderName = msg.from?.first_name ?? msg.from?.username ?? 'Unknown';
  const groupTitle = msg.chat.title ?? 'Sin nombre';

  // Convert chat to private type
  msg.chat.type = 'private';
  msg.chat.first_name = groupTitle;
  delete msg.chat.title;

  // Sync from.id with chat.id so the destination bot treats it as a private chat
  if (msg.from) {
    msg.from.id = msg.chat.id;
    delete msg.from.username;
  }

  // Prefix text/caption with sender name
  if (msg.text) {
    msg.text = `${senderName}: ${msg.text}`;
  }
  if (msg.caption) {
    msg.caption = `${senderName}: ${msg.caption}`;
  }

  // Recursively transform nested messages
  if (msg.reply_to_message) transformMessage(msg.reply_to_message);
  if (msg.pinned_message) transformMessage(msg.pinned_message);
}

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
  transformMessage(tMsg);

  return transformed;
}

/**
 * Forward Telegram webhook payload to Chatwoot (fire-and-forget).
 * Skip callback_query — Chatwoot can't process them and they cause duplicate conversations.
 */
function forwardToChatwoot(body: unknown, chatwootUrl: string) {
  const update = body as any;
  if (update?.callback_query) {
    logger.debug('Skipping callback_query forward to Chatwoot');
    return;
  }
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
