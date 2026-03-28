import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

// TODO: Configurar mensajes por equipo
const TEAM_MESSAGES: Record<number, string> = {
  // Ejemplo:
  // 1: 'Tu conversación ha sido transferida al equipo de Soporte.',
  // 2: 'Tu conversación ha sido transferida al equipo de Facturación.',
};

const DEFAULT_TRANSFER_MESSAGE = 'Tu conversación ha sido transferida. Un agente del nuevo equipo te atenderá pronto.';

export async function handleConversationUpdated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  const changedAttributes = payload.changed_attributes;
  if (!conversation || !changedAttributes) return;

  // Check if team_id changed
  const teamChange = changedAttributes.find(
    (attr: any) => 'team_id' in (attr as Record<string, unknown>)
  );

  // Alternative: check via changed_attributes structure from Chatwoot
  // Chatwoot sends changed_attributes as { attribute_name: { previous_value, current_value } }
  const changes = payload.changed_attributes as unknown as Record<string, { previous_value: unknown; current_value: unknown }>;
  if (!changes?.team_id) return;

  const previousTeamId = changes.team_id.previous_value as number | null;
  const currentTeamId = changes.team_id.current_value as number | null;

  if (previousTeamId === currentTeamId) return;

  await withExecutionLog(
    {
      eventType: 'chatwoot:team_changed',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
      metadata: { previousTeamId, currentTeamId },
    },
    async () => {
      if (!currentTeamId) return { action: 'team_removed' };

      const message = TEAM_MESSAGES[currentTeamId] ?? DEFAULT_TRANSFER_MESSAGE;
      await chatwootService.sendMessage(conversation.id, {
        content: message,
        message_type: 'outgoing',
      });

      logger.info({ conversationId: conversation.id, previousTeamId, currentTeamId }, 'Team change notified');
      return { action: 'notified', previousTeamId, currentTeamId };
    },
  );
}
