import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

const FAREWELL_MESSAGE = '¡Gracias por contactarnos! Si necesitas algo más, no dudes en escribirnos. 😊';
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
      // Send farewell message
      await chatwootService.sendMessage(conversation.id, {
        content: FAREWELL_MESSAGE,
        message_type: 'outgoing',
      });

      // Add closing labels
      await chatwootService.addLabels(conversation.id, CLOSING_LABELS);

      logger.info({ conversationId: conversation.id }, 'Conversation closed with farewell');
      return { farewell: 'sent', labels: CLOSING_LABELS };
    },
  );
}
