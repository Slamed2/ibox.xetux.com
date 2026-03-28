import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

// TODO: Configurar keywords y sus team_ids correspondientes
const KEYWORD_ROUTES: Array<{ keywords: string[]; teamId: number; label: string }> = [
  // Ejemplo:
  // { keywords: ['factura', 'cobro', 'pago'], teamId: 2, label: 'billing' },
  // { keywords: ['tecnico', 'error', 'problema'], teamId: 3, label: 'technical' },
];

export async function handleMessageCreated(payload: ChatwootWebhookPayload) {
  const message = payload.message;
  const conversation = payload.conversation;
  if (!message || !conversation) return;

  const isOutgoing = message.message_type !== 'incoming';
  const isBot = message.sender?.type === 'agent_bot';

  await withExecutionLog(
    {
      eventType: 'chatwoot:message_created',
      source: 'chatwoot_webhook',
      direction: isOutgoing ? 'outbound' : 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
      metadata: { messageType: message.message_type, senderType: message.sender?.type ?? null },
    },
    async () => {
      // Skip outgoing messages and bot messages to avoid loops
      if (isOutgoing || isBot) {
        return { action: 'skipped', reason: isBot ? 'bot_message' : 'outgoing_message' };
      }
      // Skip if conversation already has a team assigned
      if (conversation.team_id) {
        logger.debug({ conversationId: conversation.id }, 'Conversation already has team, skipping routing');
        return { action: 'skipped', reason: 'team_already_assigned' };
      }

      // Try keyword-based routing
      const content = message.content?.toLowerCase() ?? '';
      for (const route of KEYWORD_ROUTES) {
        if (route.keywords.some(kw => content.includes(kw))) {
          await chatwootService.assignConversation(conversation.id, { team_id: route.teamId });
          await chatwootService.addLabels(conversation.id, [route.label]);
          logger.info({ conversationId: conversation.id, route: route.label }, 'Routed by keyword');
          return { action: 'routed', teamId: route.teamId, label: route.label };
        }
      }

      return { action: 'no_match', content: message.content };
    },
  );
}
