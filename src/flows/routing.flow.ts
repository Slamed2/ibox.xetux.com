import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, markBotAssignment } from '../services/telegram.service.js';
import { recentlyGreetedConversations } from './greeting.flow.js';
import {
  TEAMS,
  TEAM_LABELS,
  resolveTeamFromCommand,
  buildDepartmentKeyboard,
  VENTAS_ADMIN_ENABLED,
} from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';
import { TtlMap } from '../utils/ttl-map.js';

// TODO: Configurar keywords y sus team_ids correspondientes
const KEYWORD_ROUTES: Array<{ keywords: string[]; teamId: number; label: string }> = [];

import { CONSULTORIA_VE_GREETING, CONSULTORIA_VE_OUT_OF_HOURS, DEPARTMENT_SWITCH_HINT } from '../constants/messages.js';
import { isConsultoriaVeOpen } from '../utils/business-hours.js';

function teamConfirmText(teamId: number, teamLabel: string, conversationId: number): string {
  if (teamId === TEAMS.CONSULTORIA_VE) return CONSULTORIA_VE_GREETING;
  return `✅ Conversación #${conversationId} asignada a *${teamLabel}*.\n\nUn agente te atenderá pronto.\n\n${DEPARTMENT_SWITCH_HINT}`;
}

function teamConfirmTextPlain(teamId: number, teamLabel: string, conversationId: number): string {
  if (teamId === TEAMS.CONSULTORIA_VE) return CONSULTORIA_VE_GREETING;
  return `✅ Conversación #${conversationId} asignada a ${teamLabel}.\n\nUn agente te atenderá pronto.\n\n${DEPARTMENT_SWITCH_HINT}`;
}

/**
 * Track nudge state per conversation to send exactly ONE reminder
 * when a user ignores the login button or department menu.
 */
type NudgeState = 'dept_pending' | 'dept_reminded';
export const conversationNudgeState = new TtlMap<number, NudgeState>(30 * 60_000); // 30 min TTL

const NUDGE_SELECT_DEPARTMENT =
  '👋 Para continuar, selecciona el departamento con el que deseas comunicarte:';

/**
 * Extract a bot command from message content.
 * Private: "/registro" or "/registro@xetuxBot"
 * Group (transformed): "SenderName: /registro@xetuxBot"
 */
function extractCommand(content: string): string | null {
  const match = content.match(/(?:^|:\s)\/(consultoria|soporte|ventas|administracion|start)(?:@\w+)?/);
  return match ? match[1] : null;
}

/**
 * Extract team selection from raw callback data forwarded as message.
 * Format: "team:2:Soporte" or "SenderName: team:2:Soporte"
 */
function extractTeamSelection(content: string): { teamId: number; teamLabel: string } | null {
  const match = content.match(/(?:^|:\s)team:(\d+):(.+)$/);
  if (!match) return null;
  return { teamId: parseInt(match[1], 10), teamLabel: match[2] };
}

export async function handleMessageCreated(payload: ChatwootWebhookPayload) {
  const message = payload.message;
  const conversation = payload.conversation;
  if (!message || !conversation) return;

  const isOutgoing = message.message_type !== 'incoming';
  const isBot = message.sender?.type === 'agent_bot';

  // Skip outgoing and bot messages to avoid loops
  if (isOutgoing || isBot) return;

  const content = message.content ?? '';
  const conversationId = conversation.id;
  const contact = conversation.contact ?? (conversation as any).meta?.sender;
  const contactId = contact?.id;
  const telegramUserId = contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  // Skip all automations for conversations labeled "interno"
  const labels = conversation.labels ?? [];
  if (labels.includes('interno')) {
    logger.debug({ conversationId }, 'Routing: skipping — interno conversation');
    return;
  }

  // --- Team selection from callback button ---
  const teamSelection = extractTeamSelection(content);
  if (teamSelection) {
    await handleTeamSelection(teamSelection, conversationId, contactId, telegramUserId, message, payload);
    return;
  }

  // --- Bot commands ---
  const command = extractCommand(content);
  if (command) {
    // /start — greeting is handled by the conversation_created flow
    if (command === 'start') return;

    // Skip if greeting flow just handled this conversation (prevents duplicate menus)
    if (recentlyGreetedConversations.has(conversationId)) {
      logger.debug({ conversationId, command }, 'Routing: skipping command — greeting flow just handled this conversation');
      return;
    }

    // Department commands: /consultoria, /soporte, /ventas, /administracion
    await handleDepartmentCommand(command, conversationId, contactId, telegramUserId, payload);
    return;
  }

  // --- Delete raw callback data that leaked through ---
  if (content.startsWith('team:') && message.id) {
    await chatwootService.deleteMessage(conversationId, message.id as number);
    return;
  }

  // --- Nudge: one-time reminder for users ignoring the department menu ---
  if (telegramUserId) {
    const nudgeState = conversationNudgeState.get(conversationId);

    if (nudgeState === 'dept_pending') {
      conversationNudgeState.set(conversationId, 'dept_reminded');

      const keyboard = buildDepartmentKeyboard();

      const sentMsg = await bot.api.sendMessage(telegramUserId, NUDGE_SELECT_DEPARTMENT, { reply_markup: keyboard });
      await chatwootService.sendMessage(conversationId, {
        content: NUDGE_SELECT_DEPARTMENT,
        message_type: 'outgoing',
        source_id: String(sentMsg.message_id),
      });
      logger.info({ conversationId }, 'Nudge: sent department reminder');
      return;
    }

    // Already reminded — do nothing
    if (nudgeState === 'dept_reminded') {
      return;
    }
  }

  // --- Keyword routing (existing) ---
  if (conversation.team_id) {
    return { action: 'skipped', reason: 'team_already_assigned' };
  }

  const lowerContent = content.toLowerCase();
  for (const route of KEYWORD_ROUTES) {
    if (route.keywords.some(kw => lowerContent.includes(kw))) {
      await chatwootService.assignConversation(conversationId, { team_id: route.teamId });
      await chatwootService.addLabels(conversationId, [route.label]);
      logger.info({ conversationId, route: route.label }, 'Routed by keyword');
      return { action: 'routed', teamId: route.teamId, label: route.label };
    }
  }

  return { action: 'no_match', content };
}

/**
 * Mensajes extra que se envían tras asignar Consultoría VE:
 * - Si está fuera de horario (hora de Venezuela), avisa que el canal está cerrado.
 *   El chat YA quedó asignado; el aviso es solo informativo.
 * - Siempre envía el hint para cambiar de departamento.
 * Cada mensaje se espeja en Chatwoot con su source_id de Telegram.
 */
async function sendConsultoriaVePostAssign(conversationId: number, telegramUserId: number) {
  if (!isConsultoriaVeOpen()) {
    const closedMsg = await bot.api.sendMessage(telegramUserId, CONSULTORIA_VE_OUT_OF_HOURS);
    await chatwootService.sendMessage(conversationId, {
      content: CONSULTORIA_VE_OUT_OF_HOURS,
      message_type: 'outgoing',
      source_id: String(closedMsg.message_id),
    });
  }

  const hintMsg = await bot.api.sendMessage(telegramUserId, DEPARTMENT_SWITCH_HINT);
  await chatwootService.sendMessage(conversationId, {
    content: DEPARTMENT_SWITCH_HINT,
    message_type: 'outgoing',
    source_id: String(hintMsg.message_id),
  });
}

/**
 * Asigna la conversación a un equipo. Caso especial SOPORTE VE (reevaluación de agente):
 * cuando un cliente re-selecciona Soporte VE y su agente actual SIGUE CONECTADO
 * (online/busy), se respeta — no se reasigna. Si el agente está offline, no hay agente,
 * o la conversación viene de otro equipo, se desasigna agente + equipo y se reasigna el
 * equipo → Chatwoot (auto-assign ON en Soporte VE) toma a un agente disponible.
 * Para el resto de equipos, asignación normal (sin cambios).
 */
async function assignTeamSmart(conversationId: number, teamId: number): Promise<void> {
  if (teamId !== TEAMS.SOPORTE_VE) {
    await chatwootService.assignConversation(conversationId, { team_id: teamId });
    return;
  }

  // Soporte VE — leer estado actual (equipo + agente)
  let currentTeamId: number | null = null;
  let assigneeId: number | undefined;
  try {
    const conv = await chatwootService.getConversation(conversationId);
    currentTeamId = conv?.team_id != null ? Number(conv.team_id) : (conv?.meta?.team?.id ?? null);
    assigneeId = conv?.meta?.assignee?.id as number | undefined;
  } catch (err) {
    logger.warn({ err, conversationId }, 'Soporte VE: no se pudo leer la conversación; se reasigna por defecto');
  }

  // Ya está en Soporte VE con un agente → respetar si sigue conectado
  if (currentTeamId === TEAMS.SOPORTE_VE && assigneeId) {
    const agent = await chatwootService.getAgent(assigneeId);
    const status = agent?.availability_status;
    if (status === 'online' || status === 'busy') {
      logger.info({ conversationId, assigneeId, status }, 'Soporte VE: agente sigue conectado, no se reasigna');
      return; // se queda con su agente actual
    }
    logger.info({ conversationId, assigneeId, status }, 'Soporte VE: agente no conectado, reasignando');
  }

  // Sin agente, agente offline, o viene de otro equipo → reasignar fresco
  // (desasignar agente + equipo y reasignar para que Chatwoot tome a un disponible)
  await chatwootService.assignConversation(conversationId, { assignee_id: null });
  await chatwootService.assignConversation(conversationId, { team_id: null });
  await chatwootService.assignConversation(conversationId, { team_id: teamId });
}

// ─── Team selection (replaces grammY callback handler logic) ────────────────

async function handleTeamSelection(
  selection: { teamId: number; teamLabel: string },
  conversationId: number,
  contactId: number | undefined,
  telegramUserId: number | undefined,
  message: any,
  payload: ChatwootWebhookPayload,
) {
  await withExecutionLog(
    {
      eventType: 'flow:team_selection',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: { teamId: selection.teamId, teamLabel: selection.teamLabel },
      conversationId: String(conversationId),
      contactId: String(contactId ?? ''),
      metadata: { teamId: selection.teamId, teamLabel: selection.teamLabel },
    },
    async () => {
      // Delete the raw callback data message from Chatwoot
      if (message.id) {
        await chatwootService.deleteMessage(conversationId, message.id as number);
      }

      // Mark as bot assignment to suppress duplicate notifications in assignment.flow
      markBotAssignment(conversationId);
      conversationNudgeState.delete(conversationId);

      const teamLabelTag = TEAM_LABELS[selection.teamId];
      const confirmText = teamConfirmText(selection.teamId, selection.teamLabel, conversationId);
      const confirmTextPlain = teamConfirmTextPlain(selection.teamId, selection.teamLabel, conversationId);

      // Assign (con reevaluación de agente para Soporte VE) + label + telegram send
      const [, , sentMsg] = await Promise.all([
        assignTeamSmart(conversationId, selection.teamId),
        teamLabelTag ? chatwootService.addLabels(conversationId, [teamLabelTag]) : null,
        telegramUserId ? bot.api.sendMessage(telegramUserId, confirmText, { parse_mode: 'Markdown' }) : null,
      ]);

      // Sync confirmation to Chatwoot (needs telegramMessageId)
      await chatwootService.sendMessage(conversationId, {
        content: confirmTextPlain,
        message_type: 'outgoing',
        ...(sentMsg ? { source_id: String(sentMsg.message_id) } : {}),
      });

      // Consultoría VE: aviso fuera de horario (si aplica) + hint de cambio de departamento
      if (selection.teamId === TEAMS.CONSULTORIA_VE && telegramUserId) {
        await sendConsultoriaVePostAssign(conversationId, telegramUserId);
      }

      return { action: 'team_assigned', ...selection, conversationId };
    },
  );
}

// ─── Department commands (/consultoria, /soporte, /ventas, /administracion) ──

async function handleDepartmentCommand(
  command: string,
  conversationId: number,
  contactId: number | undefined,
  telegramUserId: number | undefined,
  payload: ChatwootWebhookPayload,
) {
  await withExecutionLog(
    {
      eventType: 'flow:dept_command',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: { command, conversationId },
      conversationId: String(conversationId),
      contactId: String(contactId ?? ''),
      metadata: { command },
    },
    async () => {
      if (!telegramUserId) {
        return { action: 'no_telegram_user' };
      }

      // Block disabled departments
      if (!VENTAS_ADMIN_ENABLED && (command === 'ventas' || command === 'administracion')) {
        await bot.api.sendMessage(telegramUserId, 'Este departamento no está disponible por el momento. Usa /consultoria o /soporte.');
        return { action: 'department_disabled', command };
      }

      const resolved = resolveTeamFromCommand(command);
      if (!resolved) {
        return { action: 'unknown_command', command };
      }

      markBotAssignment(conversationId);
      conversationNudgeState.delete(conversationId);

      const teamLabelTag = TEAM_LABELS[resolved.teamId];
      const confirmText = teamConfirmText(resolved.teamId, resolved.label, conversationId);
      const confirmTextPlain = teamConfirmTextPlain(resolved.teamId, resolved.label, conversationId);

      // Assign (con reevaluación de agente para Soporte VE) + label + telegram send
      const [, , sentMsg] = await Promise.all([
        assignTeamSmart(conversationId, resolved.teamId),
        teamLabelTag ? chatwootService.addLabels(conversationId, [teamLabelTag]) : null,
        bot.api.sendMessage(telegramUserId, confirmText, { parse_mode: 'Markdown' }),
      ]);

      // Sync to Chatwoot (needs telegramMessageId)
      await chatwootService.sendMessage(conversationId, {
        content: confirmTextPlain,
        message_type: 'outgoing',
        source_id: String(sentMsg.message_id),
      });

      // Consultoría VE: aviso fuera de horario (si aplica) + hint de cambio de departamento
      if (resolved.teamId === TEAMS.CONSULTORIA_VE) {
        await sendConsultoriaVePostAssign(conversationId, telegramUserId);
      }

      return { action: 'team_assigned', teamId: resolved.teamId, label: resolved.label };
    },
  );
}
