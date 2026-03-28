import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

// TODO: Configurar estos valores segun tus departamentos en Chatwoot
const GREETING_MESSAGE = '¡Hola! 👋 Gracias por contactarnos. En un momento un agente te atenderá.';

// Mapeo de inbox_id a team_id para enrutamiento automatico
const INBOX_TO_TEAM: Record<number, number> = {
  // Ejemplo: 1: 1, // inbox_id 1 -> team_id 1 (Soporte)
  // Configurar segun tu setup de Chatwoot
};

export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  await withExecutionLog(
    {
      eventType: 'chatwoot:conversation_created',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
    },
    async () => {
      // Send greeting message
      await chatwootService.sendMessage(conversation.id, {
        content: GREETING_MESSAGE,
        message_type: 'outgoing',
      });

      // Auto-assign team based on inbox
      const teamId = INBOX_TO_TEAM[conversation.inbox_id];
      if (teamId) {
        await chatwootService.assignConversation(conversation.id, { team_id: teamId });
        logger.info({ conversationId: conversation.id, teamId }, 'Auto-assigned team');
      }

      return { greeting: 'sent', teamAssigned: teamId ?? null };
    },
  );
}
