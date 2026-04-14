import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, wasBotAssignment, markBotAssignment } from '../services/telegram.service.js';
import { TEAMS, TEAM_LABELS, TEAM_NAMES } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function handleConversationUpdated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Detect "interno" label → persist flag on contact
  const labels = conversation.labels ?? [];
  const contactId = conversation.contact?.id;
  if (labels.includes('interno') && contactId) {
    const currentAttrs = conversation.contact?.custom_attributes ?? {};
    if (!currentAttrs.interno) {
      await chatwootService.updateContact(contactId, {
        custom_attributes: { ...currentAttrs, interno: true },
      });
      logger.info({ contactId, conversationId: conversation.id }, 'Marked contact as interno');
    }
  }

  const changedAttrs = payload.changed_attributes as unknown as Array<Record<string, { previous_value: unknown; current_value: unknown }>> | undefined;
  if (!changedAttrs || !Array.isArray(changedAttrs)) return;

  // Skip assignment notifications for interno conversations
  if (labels.includes('interno')) return;

  const telegramUserId = conversation.contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  // Handle team change
  const teamChange = changedAttrs.find((attr) => 'team_id' in attr);
  if (teamChange) {
    const previousTeamId = teamChange.team_id.previous_value != null ? Number(teamChange.team_id.previous_value) : null;
    const currentTeamId = teamChange.team_id.current_value != null ? Number(teamChange.team_id.current_value) : null;

    if (previousTeamId !== currentTeamId && !wasBotAssignment(conversation.id) && currentTeamId) {
      await handleTeamChange(conversation, telegramUserId, currentTeamId, payload);
    }
  }

  // Handle assignee change
  const assigneeChange = changedAttrs.find((attr) => 'assignee_id' in attr);
  if (assigneeChange) {
    const previousAssigneeId = assigneeChange.assignee_id.previous_value as number | null;
    const currentAssigneeId = assigneeChange.assignee_id.current_value as number | null;

    if (previousAssigneeId !== currentAssigneeId && currentAssigneeId) {
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
      const message = currentTeamId === TEAMS.CONSULTORIA_VE
        ? '¡Buen día! ☀️ Esperamos que se encuentre muy bien. 😊\n\nLe saluda el Departamento de Consultoría Venezuela Xetux. ¿En qué podemos ayudarle el día de hoy?'
        : `🔄 Conversación #${conversation.id} transferida a *${teamName}*.\n\nUn agente te atenderá pronto.`;
      const teamLabelTag = TEAM_LABELS[currentTeamId];

      // Telegram send + label replace (parallel — independent of each other)
      const [sentMsg] = await Promise.all([
        telegramUserId ? bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' }) : null,
        teamLabelTag ? chatwootService.addLabels(conversation.id, [teamLabelTag]) : null,
      ]);

      // Sync to Chatwoot (needs telegramMessageId)
      const chatwootContent = currentTeamId === TEAMS.CONSULTORIA_VE
        ? '¡Buen día! ☀️ Esperamos que se encuentre muy bien. 😊\n\nLe saluda el Departamento de Consultoría Venezuela Xetux. ¿En qué podemos ayudarle el día de hoy?'
        : `🔄 Conversación #${conversation.id} transferida a ${teamName}. Un agente te atenderá pronto.`;
      await chatwootService.sendMessage(conversation.id, {
        content: chatwootContent,
        message_type: 'outgoing',
        ...(sentMsg ? { source_id: String(sentMsg.message_id) } : {}),
      });

      // Send department switch hint as separate message for Consultoría VE
      if (currentTeamId === TEAMS.CONSULTORIA_VE && telegramUserId) {
        const hint = 'Si deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.';
        const hintMsg = await bot.api.sendMessage(telegramUserId, hint);
        await chatwootService.sendMessage(conversation.id, {
          content: hint,
          message_type: 'outgoing',
          source_id: String(hintMsg.message_id),
        });
      }

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
      // Skip assignee notification for Consultoría VE — they have their own greeting
      if (Number(conversation.team_id) === TEAMS.CONSULTORIA_VE) {
        return { action: 'assignee_skipped_consultoria_ve' };
      }

      // Get agent name: try from payload meta first, then API
      const metaAssignee = (payload as any).meta?.assignee;
      const agentName = metaAssignee?.name
        ?? (await chatwootService.getAgent(assigneeId))?.name
        ?? 'Un agente';
      const teamId = conversation.team_id as number | undefined;
      const teamName = teamId ? (TEAM_NAMES[teamId] ?? '') : '';
      const areaText = teamName ? ` del área de *${teamName}*` : '';

      const message = `👋 Mi nombre es *${agentName}*${areaText} de ${config.COMPANY_NAME} y estaré encantado de atenderte.`;

      let telegramMessageId: number | undefined;
      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        telegramMessageId = sentMsg.message_id;
      }

      await chatwootService.sendMessage(conversation.id, {
        content: `👋 Mi nombre es ${agentName}${teamName ? ` del área de ${teamName}` : ''} de ${config.COMPANY_NAME} y estaré encantado de atenderte.`,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      return { action: 'assignee_notified', assigneeId, agentName, teamName };
    },
  );
}
