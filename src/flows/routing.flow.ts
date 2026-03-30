import { InlineKeyboard } from 'grammy';
import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, markBotAssignment } from '../services/telegram.service.js';
import { recentlyGreetedConversations } from './greeting.flow.js';
import {
  TEAMS,
  TEAM_LABELS,
  TEAM_NAMES,
  ALL_DEPARTMENT_LABELS,
  resolveTeamFromCommand,
} from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// TODO: Configurar keywords y sus team_ids correspondientes
const KEYWORD_ROUTES: Array<{ keywords: string[]; teamId: number; label: string }> = [];

/**
 * Extract a bot command from message content.
 * Private: "/registro" or "/registro@xetuxBot"
 * Group (transformed): "SenderName: /registro@xetuxBot"
 */
function extractCommand(content: string): string | null {
  const match = content.match(/(?:^|:\s)\/(registro|consultoria|soporte|ventas|administracion|start)(?:@\w+)?/);
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
  const xetuxId = contact?.custom_attributes?.xetux_id as string | undefined;
  const telegramUserId = contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  // --- Team selection from callback button ---
  const teamSelection = extractTeamSelection(content);
  if (teamSelection) {
    await handleTeamSelection(teamSelection, conversationId, contactId, telegramUserId, message, payload);
    return;
  }

  // --- Bot commands ---
  const command = extractCommand(content);
  if (command) {
    // Skip /start — handled by grammY for deep link parsing
    if (command === 'start') return;

    // Skip if greeting flow just handled this conversation (prevents duplicate login buttons)
    if (recentlyGreetedConversations.has(conversationId)) {
      logger.debug({ conversationId, command }, 'Routing: skipping command — greeting flow just handled this conversation');
      return;
    }

    if (command === 'registro') {
      await handleRegistroCommand(conversationId, contactId, xetuxId, telegramUserId, payload);
      return;
    }

    // Department commands: /consultoria, /soporte, /ventas, /administracion
    await handleDepartmentCommand(command, conversationId, contactId, xetuxId, telegramUserId, payload);
    return;
  }

  // --- Delete raw callback data that leaked through ---
  if (content.startsWith('team:') && message.id) {
    await chatwootService.deleteMessage(conversationId, message.id as number);
    return;
  }

  // --- Keyword routing (existing) ---
  await withExecutionLog(
    {
      eventType: 'chatwoot:message_created',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversationId),
      contactId: String(contactId ?? ''),
      metadata: { messageType: message.message_type, senderType: message.sender?.type ?? null },
    },
    async () => {
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
    },
  );
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

      const teamLabelTag = TEAM_LABELS[selection.teamId];
      const confirmText = `✅ Conversación #${conversationId} asignada a *${selection.teamLabel}*.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`;

      // Assign + label + telegram send (parallel — all independent)
      const [, , sentMsg] = await Promise.all([
        chatwootService.assignConversation(conversationId, { team_id: selection.teamId }),
        teamLabelTag ? chatwootService.replaceDepartmentLabel(conversationId, teamLabelTag, ALL_DEPARTMENT_LABELS) : null,
        telegramUserId ? bot.api.sendMessage(telegramUserId, confirmText, { parse_mode: 'Markdown' }) : null,
      ]);

      // Sync confirmation to Chatwoot (needs telegramMessageId)
      await chatwootService.sendMessage(conversationId, {
        content: `✅ Conversación #${conversationId} asignada a ${selection.teamLabel}.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`,
        message_type: 'outgoing',
        ...(sentMsg ? { source_id: String(sentMsg.message_id) } : {}),
      });

      return { action: 'team_assigned', ...selection, conversationId };
    },
  );
}

// ─── /registro command ──────────────────────────────────────────────────────

async function handleRegistroCommand(
  conversationId: number,
  contactId: number | undefined,
  xetuxId: string | undefined,
  telegramUserId: number | undefined,
  payload: ChatwootWebhookPayload,
) {
  await withExecutionLog(
    {
      eventType: 'flow:registro',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: { conversationId, xetuxId },
      conversationId: String(conversationId),
      contactId: String(contactId ?? ''),
      metadata: { xetuxId: xetuxId ?? null, telegramUserId: telegramUserId ?? null },
    },
    async () => {
      if (!telegramUserId) {
        return { action: 'no_telegram_user' };
      }

      // Already registered: show department menu
      if (xetuxId) {
        const country = xetuxId.toUpperCase().startsWith('MX') ? 'mx' : 've';
        const keyboard = new InlineKeyboard()
          .text('💼 Consultoría', `team:${country === 'mx' ? TEAMS.CONSULTORIA_MX : TEAMS.CONSULTORIA_VE}:Consultoría`)
          .text('🛠 Soporte', `team:${country === 'mx' ? TEAMS.SOPORTE_MX : TEAMS.SOPORTE_VE}:Soporte`)
          .row()
          .text('🛒 Ventas', `team:${country === 'mx' ? TEAMS.VENTAS_MX : TEAMS.VENTAS_VE}:Ventas`)
          .text('📋 Administración', `team:${country === 'mx' ? TEAMS.ADMINISTRACION_MX : TEAMS.ADMINISTRACION_VE}:Administración`);

        const sentMsg = await bot.api.sendMessage(telegramUserId, 'Ya estás registrado. ¿Con qué departamento deseas comunicarte?', { reply_markup: keyboard });
        await chatwootService.sendMessage(conversationId, {
          content: 'Ya estás registrado. ¿Con qué departamento deseas comunicarte?',
          message_type: 'outgoing',
          source_id: String(sentMsg.message_id),
        });
        return { action: 'registro_already_registered', xetuxId };
      }

      // Not registered: show login button
      const webappUrl = `${config.WEBAPP_BASE_URL}?contact_id=${contactId ?? ''}&conversation_id=${conversationId}`;
      const isGroup = (telegramUserId ?? 0) < 0;
      const keyboard = isGroup
        ? new InlineKeyboard().url('🔑 Iniciar sesión', webappUrl.replace('/webapp?', '/webapp/login?'))
        : new InlineKeyboard().webApp('🔑 Iniciar sesión', webappUrl);

      const sentMsg = await bot.api.sendMessage(telegramUserId, 'Toca el botón para iniciar sesión:', { reply_markup: keyboard });
      await chatwootService.sendMessage(conversationId, {
        content: `Toca el botón para iniciar sesión:\n\n🔗 [Iniciar sesión](${webappUrl})`,
        message_type: 'outgoing',
        source_id: String(sentMsg.message_id),
      });
      return { action: 'registro_login_sent' };
    },
  );
}

// ─── Department commands (/consultoria, /soporte, /ventas, /administracion) ──

async function handleDepartmentCommand(
  command: string,
  conversationId: number,
  contactId: number | undefined,
  xetuxId: string | undefined,
  telegramUserId: number | undefined,
  payload: ChatwootWebhookPayload,
) {
  await withExecutionLog(
    {
      eventType: 'flow:dept_command',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: { command, conversationId, xetuxId },
      conversationId: String(conversationId),
      contactId: String(contactId ?? ''),
      metadata: { command, xetuxId: xetuxId ?? null },
    },
    async () => {
      if (!telegramUserId) {
        return { action: 'no_telegram_user' };
      }

      // Resolve team from xetux_id country
      const resolved = resolveTeamFromCommand(command, xetuxId);
      if (resolved) {
        markBotAssignment(conversationId);

        const teamLabelTag = TEAM_LABELS[resolved.teamId];
        const confirmText = `✅ Conversación #${conversationId} asignada a *${resolved.label}*.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`;

        // Assign + label + telegram send (parallel — all independent)
        const [, , sentMsg] = await Promise.all([
          chatwootService.assignConversation(conversationId, { team_id: resolved.teamId }),
          teamLabelTag ? chatwootService.replaceDepartmentLabel(conversationId, teamLabelTag, ALL_DEPARTMENT_LABELS) : null,
          bot.api.sendMessage(telegramUserId, confirmText, { parse_mode: 'Markdown' }),
        ]);

        // Sync to Chatwoot (needs telegramMessageId)
        await chatwootService.sendMessage(conversationId, {
          content: `✅ Conversación #${conversationId} asignada a ${resolved.label}.\n\nUn agente te atenderá pronto.\n\nSi deseas comunicarte con otro departamento, usa el menú ☰ en la parte inferior.`,
          message_type: 'outgoing',
          source_id: String(sentMsg.message_id),
        });

        return { action: 'team_assigned', teamId: resolved.teamId, label: resolved.label };
      }

      // No xetux_id: show login button
      const webappUrl = `${config.WEBAPP_BASE_URL}?contact_id=${contactId ?? ''}&conversation_id=${conversationId}`;
      const isGroup = (telegramUserId ?? 0) < 0;
      const keyboard = isGroup
        ? new InlineKeyboard().url('🔑 Iniciar sesión', webappUrl.replace('/webapp?', '/webapp/login?'))
        : new InlineKeyboard().webApp('🔑 Iniciar sesión', webappUrl);

      const sentMsg = await bot.api.sendMessage(telegramUserId, 'Para usar los departamentos primero debes iniciar sesión.', { reply_markup: keyboard });
      await chatwootService.sendMessage(conversationId, {
        content: 'Para usar los departamentos primero debes iniciar sesión.',
        message_type: 'outgoing',
        source_id: String(sentMsg.message_id),
      });

      return { action: 'login_required', command };
    },
  );
}
