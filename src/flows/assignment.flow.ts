import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, wasBotAssignment, markBotAssignment } from '../services/telegram.service.js';
import { TEAMS, TEAM_LABELS, TEAM_NAMES } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { CONSULTORIA_VE_GREETING, DEPARTMENT_SWITCH_HINT } from '../constants/messages.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { assignTeamSmart } from './routing.flow.js';

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

  // Pospuesto que se reactiva (el cliente volvió a escribir o venció el plazo)
  const statusChange = changedAttrs.find((attr) => 'status' in attr);
  if (
    statusChange &&
    statusChange.status.previous_value === 'snoozed' &&
    statusChange.status.current_value === 'open'
  ) {
    scheduleSnoozedReassign(conversation.id);
  }

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

// ─── Pospuesto reactivado → agente disponible ───────────────────────────────
//
// Al posponer, el agente se quita el chat para que, cuando el cliente vuelva,
// lo tome quien esté conectado. Con los PENDIENTES eso lo hace la regla 10 de
// Chatwoot (→ n8n), pero con los POSPUESTOS no llega a dispararse: Chatwoot
// reabre el chat al entrar el mensaje y la regla ya lo ve «abierto». Aquí se
// detecta el paso pospuesto → abierto y se vuelve a asignar el chat a su mismo
// equipo para que Chatwoot elija un agente conectado. Se espera unos segundos y
// se relee la conversación, por si otra vía ya le puso agente.

const SNOOZED_REASSIGN_DELAY_MS = 8000;
const pendingSnoozedReassign = new Set<number>();

function scheduleSnoozedReassign(conversationId: number) {
  if (pendingSnoozedReassign.has(conversationId)) return;
  pendingSnoozedReassign.add(conversationId);
  const timer = setTimeout(() => {
    pendingSnoozedReassign.delete(conversationId);
    void reassignReactivatedSnoozed(conversationId).catch((err) =>
      logger.error({ err, conversationId }, 'Pospuesto reactivado: falló la reasignación'),
    );
  }, SNOOZED_REASSIGN_DELAY_MS);
  timer.unref();
}

async function reassignReactivatedSnoozed(conversationId: number) {
  await withExecutionLog(
    {
      eventType: 'flow:snoozed_reactivated',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: { conversationId },
      conversationId: String(conversationId),
    },
    async () => {
      const conv = await chatwootService.getConversation(conversationId);
      if (conv?.status !== 'open') return { action: 'skipped', reason: 'no_abierta', status: conv?.status };
      if (conv?.meta?.assignee?.id) return { action: 'skipped', reason: 'ya_tiene_agente' };
      const labels: unknown = conv?.labels ?? [];
      if (Array.isArray(labels) && labels.includes('interno')) return { action: 'skipped', reason: 'interno' };

      const teamId: number | null = conv?.team_id != null ? Number(conv.team_id) : (conv?.meta?.team?.id ?? null);

      // Sin equipo o en Soporte VE: la misma lógica que el resto del bot.
      if (teamId == null || teamId === TEAMS.SOPORTE_VE) {
        markBotAssignment(conversationId); // sin «te transferí…»: el cliente sigue su caso
        await assignTeamSmart(conversationId, TEAMS.SOPORTE_VE);
        logger.info({ conversationId, teamId }, 'Pospuesto reactivado → Soporte VE (agente conectado)');
        return { action: 'reassigned', teamId: TEAMS.SOPORTE_VE };
      }

      // Otro equipo: solo si reparte solo; si no (p. ej. Consultoría VE), se deja.
      if (!(await chatwootService.teamAllowsAutoAssign(teamId))) {
        return { action: 'skipped', reason: 'equipo_sin_autoasignacion', teamId };
      }
      markBotAssignment(conversationId);
      await chatwootService.assignConversation(conversationId, { team_id: null });
      await chatwootService.assignConversation(conversationId, { team_id: teamId });
      logger.info({ conversationId, teamId }, 'Pospuesto reactivado → mismo equipo (agente conectado)');
      return { action: 'reassigned', teamId };
    },
  );
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
        ? CONSULTORIA_VE_GREETING
        : `🔄 Con el fin de darte la mejor atención, he transferido tu consulta al equipo especializado de *${teamName}*.\nUn agente de esa área tomará tu chat en breve para darle continuidad a tu requerimiento. ¡Gracias por tu paciencia!`;
      const teamLabelTag = TEAM_LABELS[currentTeamId];

      // Telegram send + label replace (parallel — independent of each other)
      const [sentMsg] = await Promise.all([
        telegramUserId ? bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' }) : null,
        teamLabelTag ? chatwootService.addLabels(conversation.id, [teamLabelTag]) : null,
      ]);

      // Sync to Chatwoot (needs telegramMessageId)
      const chatwootContent = currentTeamId === TEAMS.CONSULTORIA_VE
        ? CONSULTORIA_VE_GREETING
        : `🔄 Con el fin de darte la mejor atención, he transferido tu consulta al equipo especializado de ${teamName}.\nUn agente de esa área tomará tu chat en breve para darle continuidad a tu requerimiento. ¡Gracias por tu paciencia!`;
      await chatwootService.sendMessage(conversation.id, {
        content: chatwootContent,
        message_type: 'outgoing',
        ...(sentMsg ? { source_id: String(sentMsg.message_id) } : {}),
      });

      // Send department switch hint as separate message for Consultoría VE
      if (currentTeamId === TEAMS.CONSULTORIA_VE && telegramUserId) {
        const hint = DEPARTMENT_SWITCH_HINT;
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
      // conversation.team_id may be missing from the webhook payload, so fetch if needed
      let convTeamId = conversation.team_id != null ? Number(conversation.team_id) : null;
      if (convTeamId == null) {
        const conv = await chatwootService.getConversation(conversation.id);
        convTeamId = conv?.team_id != null ? Number(conv.team_id) : null;
      }
      logger.debug({ conversationId: conversation.id, convTeamId, rawTeamId: conversation.team_id }, 'Assignee change: team_id check');
      if (convTeamId === TEAMS.CONSULTORIA_VE) {
        return { action: 'assignee_skipped_consultoria_ve' };
      }

      // Get agent name: try from payload meta first, then API
      const metaAssignee = (payload as any).meta?.assignee;
      const agentName = metaAssignee?.name
        ?? (await chatwootService.getAgent(assigneeId))?.name
        ?? 'Un agente';
      const teamName = convTeamId ? (TEAM_NAMES[convTeamId] ?? '') : '';
      const areaText = teamName ? `, del equipo de *${teamName}*` : '';

      const message = `👋 ¡Hola! Mi nombre es *${agentName}*${areaText} de ${config.COMPANY_NAME}.\nYa estoy revisando tu caso y con mucho gusto te voy a acompañar para resolverlo hoy mismo. ¿Cómo te encuentras?`;

      let telegramMessageId: number | undefined;
      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        telegramMessageId = sentMsg.message_id;
      }

      await chatwootService.sendMessage(conversation.id, {
        content: `👋 ¡Hola! Mi nombre es ${agentName}${teamName ? `, del equipo de ${teamName}` : ''} de ${config.COMPANY_NAME}.\nYa estoy revisando tu caso y con mucho gusto te voy a acompañar para resolverlo hoy mismo. ¿Cómo te encuentras?`,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      return { action: 'assignee_notified', assigneeId, agentName, teamName };
    },
  );
}
