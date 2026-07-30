import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import { buildDepartmentKeyboard, buildSysfailKeyboard, SYSFAIL_QUESTION, MENU_TEXT } from '../services/department-menu.js';
import { conversationNudgeState } from './routing.flow.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TtlMap } from '../utils/ttl-map.js';

/**
 * Track recently greeted conversations so the routing flow skips duplicate
 * command handling (e.g. a command arriving as the first message).
 * Entries auto-expire after 10 seconds.
 */
export const recentlyGreetedConversations = new TtlMap<number, true>(10_000);

const WELCOME = `¡Bienvenido a ${config.COMPANY_NAME}! 👋\n\n¿Con qué departamento deseas comunicarte?`;

/**
 * Envía el menú de departamento (Consultoría / Soporte) y deja la conversación
 * esperando la selección. Reutilizado por la respuesta "No" del triage de falla.
 */
export async function sendDepartmentMenu(conversationId: number, telegramUserId: number | undefined) {
  let telegramMessageId: number | undefined;
  if (telegramUserId) {
    const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME, { reply_markup: buildDepartmentKeyboard() });
    telegramMessageId = sentMsg.message_id;
    // Clear any stale per-chat command menu (old flow set /registro for the chat)
    await bot.api.deleteMyCommands({ scope: { type: 'chat', chat_id: telegramUserId } }).catch(() => {});
  }
  await chatwootService.sendMessage(conversationId, {
    content: `${WELCOME}\n\n${MENU_TEXT}`,
    message_type: 'outgoing',
    content_attributes: { external_created_at: new Date().toISOString() },
    ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
  });
  conversationNudgeState.set(conversationId, 'dept_pending');
}

export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  const contact = conversation.contact;
  const isInterno = contact?.custom_attributes?.interno === true;
  const telegramUserId = contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  // Internal contacts: auto-label and skip all automations
  if (isInterno) {
    logger.info({ conversationId: conversation.id, contactId: contact?.id }, 'Greeting flow: skipping — interno contact');
    await chatwootService.addLabels(conversation.id, ['interno']);
    return;
  }

  logger.info({ telegramUserId, conversationId: conversation.id }, 'Greeting flow: conversation created');

  await withExecutionLog(
    {
      eventType: 'flow:greeting',
      source: 'chatwoot_webhook',
      direction: 'outbound',
      inputData: { conversationId: conversation.id, telegramUserId },
      conversationId: String(conversation.id),
      contactId: String(contact?.id ?? ''),
      metadata: { telegramUserId: telegramUserId ?? null },
    },
    async () => {
      // Primer mensaje: triage de falla de sistema (Sí / No)
      let telegramMessageId: number | undefined;
      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, SYSFAIL_QUESTION, { reply_markup: buildSysfailKeyboard() });
        telegramMessageId = sentMsg.message_id;
        // Clear any stale per-chat command menu (old flow set /registro for the chat)
        await bot.api.deleteMyCommands({ scope: { type: 'chat', chat_id: telegramUserId } }).catch(() => {});
      }

      // Mirror to Chatwoot
      await chatwootService.sendMessage(conversation.id, {
        content: `${SYSFAIL_QUESTION}\n\nSí | No`,
        message_type: 'outgoing',
        content_attributes: { external_created_at: new Date().toISOString() },
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      conversationNudgeState.set(conversation.id, 'sysfail_pending');
      recentlyGreetedConversations.set(conversation.id, true);

      return { greeting: 'sysfail_triage', telegramMessageId };
    },
  );
}
