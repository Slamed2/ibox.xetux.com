import { bot } from '../services/telegram.service.js';
import { logger } from '../utils/logger.js';

export async function handleMessageUpdated(raw: Record<string, unknown>) {
  const contentAttributes = raw.content_attributes as Record<string, unknown> | undefined;
  const sourceId = raw.source_id as string | undefined;
  const conversation = raw.conversation as Record<string, unknown> | undefined;

  // Only handle deleted messages
  if (!contentAttributes?.deleted) return;
  if (!sourceId) return;

  // Get telegram chat_id from conversation contact
  const meta = conversation?.meta as Record<string, unknown> | undefined;
  const sender = meta?.sender as Record<string, unknown> | undefined;
  const additionalAttrs = sender?.additional_attributes as Record<string, unknown> | undefined;
  const telegramUserId = additionalAttrs?.social_telegram_user_id as number | undefined;

  if (!telegramUserId) return;

  try {
    await bot.api.deleteMessage(telegramUserId, parseInt(sourceId, 10));
    logger.info({ telegramUserId, sourceId, conversationId: conversation?.id }, 'Deleted Telegram message from Chatwoot');
  } catch (err) {
    logger.warn({ err, telegramUserId, sourceId }, 'Failed to delete Telegram message');
  }
}
