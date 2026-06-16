import { FastifyPluginAsync } from 'fastify';
import { webhookCallback } from 'grammy';
import axios from 'axios';
import { bot, setupTelegramWebhook, registerGroupMigration, getMigratedGroupId } from '../services/telegram.service.js';
import { keepAliveHttpAgent, keepAliveHttpsAgent, chatwootService } from '../services/chatwoot.service.js';
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

    // Detect group→supergroup migration events
    const migrateToId = msg?.migrate_to_chat_id;
    if (migrateToId && msg?.chat?.id) {
      registerGroupMigration(msg.chat.id, migrateToId);
      logger.info({ oldId: msg.chat.id, newId: migrateToId }, 'Telegram group migration detected');
      // Don't forward migration system messages to Chatwoot
      return reply.send({ ok: true });
    }

    // 1. Forward to Chatwoot and WAIT for confirmation.
    //    If Chatwoot fails, return error so Telegram retries the update.
    try {
      await forwardToChatwoot(request.body, chatwootTelegramWebhook);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Chatwoot rejected update — returning 500 so Telegram retries');
      reply.code(500);
      return { ok: false, error: 'Chatwoot forward failed' };
    }

    // 2b. Capture video thumbnails (incl. >20MB videos Chatwoot can't download).
    //     Fire-and-forget so it never blocks/breaks the webhook response.
    void handleVideoThumbnail(update).catch((err) =>
      logger.error({ err: err?.message }, 'Video thumbnail capture failed'),
    );

    // 2. Process with grammY (our bot logic) — only after Chatwoot confirmed
    const handler = webhookCallback(bot, 'fastify', {
      secretToken: config.TELEGRAM_WEBHOOK_SECRET,
    });
    return handler(request, reply);
  });

  // Set webhook URL on startup (only in production or if explicitly enabled)
  fastify.addHook('onReady', async () => {
    if (config.NODE_ENV === 'production') {
      const baseUrl = config.WEBHOOK_BASE_URL || `https://ibox.xetux.com`;
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

  // If this group was migrated to a supergroup, use the new ID
  // so messages route to the correct Chatwoot conversation.
  const migratedId = getMigratedGroupId(msg.chat.id);
  if (migratedId !== msg.chat.id) {
    logger.debug({ oldId: msg.chat.id, newId: migratedId }, 'Rewriting migrated group ID');
    msg.chat.id = migratedId;
  }

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
 * Convert a callback_query into a synthetic message update.
 * This lets Chatwoot process it like a regular message in the correct conversation.
 */
function callbackToMessage(update: any): any {
  const cb = update.callback_query;
  if (!cb?.message?.chat) return null;

  // Keep raw callback data so the routing flow can parse teamId
  const data = cb.data ?? '';

  return {
    update_id: update.update_id,
    message: {
      message_id: cb.message.message_id,
      from: cb.from,
      chat: cb.message.chat,
      date: Math.floor(Date.now() / 1000),
      text: data,
    },
  };
}

/**
 * Forward Telegram webhook payload to Chatwoot.
 * Throws on failure so the webhook can return 500 and Telegram retries.
 * For callback_query: converts to a synthetic message so Chatwoot can process it.
 * Group messages/callbacks get transformed (from.id = chat.id, type = private).
 */
async function forwardToChatwoot(body: unknown, chatwootUrl: string): Promise<void> {
  const update = body as any;

  let payload: unknown;
  if (update?.callback_query) {
    // Convert callback to synthetic message, then transform if from group
    const synthetic = callbackToMessage(update);
    if (!synthetic) {
      logger.debug('Skipping callback_query without message context');
      return;
    }
    payload = transformGroupMessage(synthetic);
  } else {
    // Regular messages (including commands) — transform if from group
    payload = transformGroupMessage(body);
  }

  await axios.post(chatwootUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: config.CHATWOOT_API_TIMEOUT_MS,
    httpAgent: keepAliveHttpAgent,
    httpsAgent: keepAliveHttpsAgent,
  });
  logger.debug('Forwarded Telegram update to Chatwoot');
}

const TELEGRAM_MAX_DOWNLOAD = 20 * 1024 * 1024; // 20 MB — límite de descarga para bots

/**
 * Cuando llega un VIDEO que supera el límite de descarga de bots (20 MB), Chatwoot
 * no puede bajarlo y lo guarda como mensaje vacío. Aquí descargamos la MINIATURA
 * (siempre <20 MB, por eso sí se puede) y la subimos a Chatwoot como nota interna,
 * para que el agente al menos vea de qué video se trata. También loguea la metadata
 * real del media (tamaño, duración, etc.).
 */
async function handleVideoThumbnail(update: any): Promise<void> {
  const msg = update?.message ?? update?.edited_message;
  if (!msg) return;

  // Solo media tipo video: video, animation (gif), video_note, o document video/*
  const media = msg.video ?? msg.animation ?? msg.video_note ?? msg.document;
  const isVideoish =
    !!(msg.video ?? msg.animation ?? msg.video_note) ||
    (msg.document?.mime_type?.startsWith('video/') ?? false);
  if (!media || !isVideoish) return;

  const fileSize = media.file_size ?? 0;
  const tooBig = fileSize > TELEGRAM_MAX_DOWNLOAD;

  // Metadata real del media (lo que no logueábamos antes)
  logger.info(
    {
      kind: msg.video ? 'video' : msg.animation ? 'animation' : msg.video_note ? 'video_note' : 'document',
      fileSize,
      durationS: media.duration,
      mime: media.mime_type,
      fileName: media.file_name,
      hasThumb: !!(media.thumbnail ?? media.thumb),
      forwarded: !!(msg.forward_origin ?? msg.forward_from ?? msg.forward_from_chat),
      tooBig,
    },
    'Incoming video media',
  );

  // Solo actuamos sobre los que Chatwoot NO pudo bajar (>20MB)
  if (!tooBig) return;

  const telegramUserId = msg.from?.id ?? msg.chat?.id;
  if (!telegramUserId) return;
  const conversationId = await chatwootService.findConversationByTelegramUserId(telegramUserId);
  if (!conversationId) {
    logger.warn({ telegramUserId }, 'Video thumbnail: no Chatwoot conversation found');
    return;
  }

  const sizeMb = (fileSize / 1048576).toFixed(1);
  const thumb = media.thumbnail ?? media.thumb;

  // Sin miniatura: al menos dejar la nota con metadata
  if (!thumb?.file_id) {
    await chatwootService.sendMessage(conversationId, {
      content: `⚠️ Video grande recibido (${sizeMb} MB) que supera el límite de 20 MB de Telegram, por eso no se cargó. Sin miniatura disponible.`,
      message_type: 'outgoing',
      private: true,
    });
    return;
  }

  // Descargar la miniatura (es chica → getFile funciona) y subirla a Chatwoot
  const file = await bot.api.getFile(thumb.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const resp = await axios.get<ArrayBuffer>(fileUrl, {
    responseType: 'arraybuffer',
    timeout: config.CHATWOOT_API_TIMEOUT_MS,
  });
  const buffer = Buffer.from(resp.data);

  const note =
    `⚠️ Video grande recibido: ${sizeMb} MB, ${media.duration ?? '?'}s. ` +
    `Telegram no permite a los bots descargar archivos >20 MB, por eso el video no se cargó. ` +
    `Miniatura de referencia ↓`;

  await chatwootService.uploadAttachment(conversationId, buffer, 'thumbnail.jpg', 'image/jpeg', note, true);
  logger.info({ conversationId, fileSize, telegramUserId }, 'Posted video thumbnail to Chatwoot');
}
