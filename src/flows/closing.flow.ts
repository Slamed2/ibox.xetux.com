import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';
const CLOSING_LABELS = ['atendido'];

export async function handleConversationResolved(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Only act on resolution
  if (conversation.status !== 'resolved') return;

  await withExecutionLog(
    {
      eventType: 'chatwoot:conversation_resolved',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
    },
    async () => {
      const farewellMessage = `Conversación #${conversation.id} cerrada.\n¡Gracias por contactarnos! Si necesitas algo más, no dudes en escribirnos. 😊`;

      // Send farewell via Telegram
      const telegramUserId = conversation.contact?.additional_attributes?.social_telegram_user_id as number | undefined;
      let telegramMessageId: number | undefined;

      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, farewellMessage);
        telegramMessageId = sentMsg.message_id;
      }

      // Sync to Chatwoot
      await chatwootService.sendMessage(conversation.id, {
        content: farewellMessage,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      // Add closing labels
      await chatwootService.addLabels(conversation.id, CLOSING_LABELS);

      logger.info({ conversationId: conversation.id }, 'Conversation closed with farewell');
      return { farewell: 'sent', labels: CLOSING_LABELS, telegramMessageId };
    },
  );
}
