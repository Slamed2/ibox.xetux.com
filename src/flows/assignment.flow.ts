import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, wasBotAssignment, markBotAssignment } from '../services/telegram.service.js';
import { TEAM_LABELS, TEAM_NAMES, ALL_DEPARTMENT_LABELS } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

export async function handleConversationUpdated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  const changedAttrs = payload.changed_attributes as unknown as Array<Record<string, { previous_value: unknown; current_value: unknown }>> | undefined;
  if (!changedAttrs || !Array.isArray(changedAttrs)) return;

  const telegramUserId = conversation.contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  // Handle team change
  const teamChange = changedAttrs.find((attr) => 'team_id' in attr);
  if (teamChange) {
    const previousTeamId = teamChange.team_id.previous_value as number | null;
    const currentTeamId = teamChange.team_id.current_value as number | null;

    if (previousTeamId !== currentTeamId && !wasBotAssignment(conversation.id) && currentTeamId) {
      await handleTeamChange(conversation, telegramUserId, currentTeamId, payload);
    }
  }

  // Handle assignee change
  const assigneeChange = changedAttrs.find((attr) => 'assignee_id' in attr);
  if (assigneeChange) {
    const previousAssigneeId = assigneeChange.assignee_id.previous_value as number | null;
    const currentAssigneeId = assigneeChange.assignee_id.current_value as number | null;

    if (previousAssigneeId !== currentAssigneeId && currentAssigneeId && !wasBotAssignment(conversation.id)) {
      await handleAssigneeChange(conversation, telegramUserId, currentAssigneeId, payload);
    }
  }
}

async function handleTeamChange(conversation: any, telegramUserId: number | undefined, currentTeamId: number, payload: ChatwootWebhookPayload) {
  await withExecutionLog(
    {
      eventType: 'chatwoot:team_changed',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
      metadata: { currentTeamId },
    },
    async () => {
      const teamName = TEAM_NAMES[currentTeamId] ?? `Equipo #${currentTeamId}`;
      const message = `🔄 Conversación #${conversation.id} transferida a *${teamName}*.\n\nUn agente te atenderá pronto.`;

      let telegramMessageId: number | undefined;
      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        telegramMessageId = sentMsg.message_id;
      }

      const teamLabelTag = TEAM_LABELS[currentTeamId];
      if (teamLabelTag) {
        await chatwootService.replaceDepartmentLabel(conversation.id, teamLabelTag, ALL_DEPARTMENT_LABELS);
      }

      await chatwootService.sendMessage(conversation.id, {
        content: `🔄 Conversación #${conversation.id} transferida a ${teamName}. Un agente te atenderá pronto.`,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      return { action: 'team_notified', currentTeamId, teamName };
    },
  );
}

async function handleAssigneeChange(conversation: any, telegramUserId: number | undefined, assigneeId: number, payload: ChatwootWebhookPayload) {
  await withExecutionLog(
    {
      eventType: 'chatwoot:assignee_changed',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
      metadata: { assigneeId },
    },
    async () => {
      // Get agent name: try from payload meta first, then API
      const metaAssignee = (payload as any).meta?.assignee;
      const agentName = metaAssignee?.name
        ?? (await chatwootService.getAgent(assigneeId))?.name
        ?? 'Un agente';
      const teamId = conversation.team_id as number | undefined;
      const teamName = teamId ? (TEAM_NAMES[teamId] ?? '') : '';
      const areaText = teamName ? ` del área de *${teamName}*` : '';

      const message = `👋 Mi nombre es *${agentName}*${areaText} de Xetux y estaré encantado de atenderte.`;

      let telegramMessageId: number | undefined;
      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        telegramMessageId = sentMsg.message_id;
      }

      await chatwootService.sendMessage(conversation.id, {
        content: `👋 Mi nombre es ${agentName}${teamName ? ` del área de ${teamName}` : ''} de Xetux y estaré encantado de atenderte.`,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      return { action: 'assignee_notified', assigneeId, agentName, teamName };
    },
  );
}
