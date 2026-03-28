import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, wasBotAssignment } from '../services/telegram.service.js';
import { TEAMS, TEAM_LABELS } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

const TEAM_NAMES: Record<number, string> = {
  [TEAMS.SOPORTE_MX]: 'Soporte México',
  [TEAMS.SOPORTE_VE]: 'Soporte Venezuela',
  [TEAMS.CONSULTORIA_VE]: 'Consultoría Venezuela',
  [TEAMS.VENTAS]: 'Ventas',
  [TEAMS.ADMINISTRACION]: 'Administración',
  [TEAMS.CONSULTORIA_MX]: 'Consultoría México',
};

export async function handleConversationUpdated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Chatwoot sends changed_attributes as { attribute_name: { previous_value, current_value } }
  const changes = payload.changed_attributes as unknown as Record<string, { previous_value: unknown; current_value: unknown }> | undefined;
  if (!changes?.team_id) return;

  const previousTeamId = changes.team_id.previous_value as number | null;
  const currentTeamId = changes.team_id.current_value as number | null;

  if (previousTeamId === currentTeamId) return;

  // Skip if this assignment was made by the bot itself (user selected from inline buttons)
  if (wasBotAssignment(conversation.id)) return;

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

      const teamName = TEAM_NAMES[currentTeamId] ?? `Equipo #${currentTeamId}`;
      const message = `🔄 Conversación #${conversation.id} transferida a *${teamName}*.\n\nUn agente te atenderá pronto.`;

      // Send via Telegram
      const telegramUserId = conversation.contact?.additional_attributes?.social_telegram_user_id as number | undefined;
      let telegramMessageId: number | undefined;

      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        telegramMessageId = sentMsg.message_id;
      }

      // Add team label
      const teamLabelTag = TEAM_LABELS[currentTeamId];
      if (teamLabelTag) {
        await chatwootService.addLabels(conversation.id, [teamLabelTag]);
      }

      // Sync to Chatwoot
      await chatwootService.sendMessage(conversation.id, {
        content: `🔄 Conversación #${conversation.id} transferida a ${teamName}. Un agente te atenderá pronto.`,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      logger.info({ conversationId: conversation.id, previousTeamId, currentTeamId, teamName }, 'Team change notified');
      return { action: 'notified', previousTeamId, currentTeamId, telegramMessageId };
    },
  );
}
