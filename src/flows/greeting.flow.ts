import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';
import { InlineKeyboard } from 'grammy';

const WEBAPP_URL = 'https://xetux2-webapp.zbawxh.easypanel.host/';

const WELCOME_MESSAGE_NO_XETUX_ID =
  '¡Bienvenido a Xetux! 🚀\n\n' +
  'Aquí podrás gestionar tus solicitudes y recibir soporte técnico.\n\n' +
  'Para comenzar, toca el botón de abajo e inicia sesión en tu cuenta.';

const WELCOME_MESSAGE_WITH_XETUX_ID =
  '¡Hola! 👋 Gracias por contactarnos. En un momento un agente te atenderá.';

// Mapeo de inbox_id a team_id para enrutamiento automatico
const INBOX_TO_TEAM: Record<number, number> = {
  // Configurar segun tu setup de Chatwoot
  // Ejemplo: 1: 1, // inbox_id 1 -> team_id 1 (Soporte)
};

export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  const contact = conversation.contact;
  const xetuxId = contact?.custom_attributes?.xetux_id as string | undefined;

  // Try multiple paths to find the Telegram user ID
  const telegramUserId = (
    contact?.additional_attributes?.social_telegram_user_id ??
    (conversation as any)?.meta?.sender?.additional_attributes?.social_telegram_user_id ??
    (payload as any)?.sender?.additional_attributes?.social_telegram_user_id ??
    contact?.identifier
  ) as number | string | undefined;

  const telegramUserIdNum = telegramUserId ? Number(telegramUserId) : undefined;

  logger.info({ telegramUserId, telegramUserIdNum, xetuxId, contactId: contact?.id, identifier: contact?.identifier }, 'Greeting flow: extracted user data');

  await withExecutionLog(
    {
      eventType: 'chatwoot:conversation_created',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(contact?.id),
      metadata: { xetuxId: xetuxId ?? null, telegramUserId: telegramUserIdNum ?? null },
    },
    async () => {
      let messageSent: string;
      let telegramMessageId: number | undefined;

      if (!xetuxId) {
        // No xetux_id: send welcome with webapp button via Telegram
        if (telegramUserIdNum) {
          const keyboard = new InlineKeyboard()
            .webApp('Iniciar sesión', WEBAPP_URL);

          const sentMsg = await bot.api.sendMessage(telegramUserIdNum, WELCOME_MESSAGE_NO_XETUX_ID, {
            reply_markup: keyboard,
          });
          telegramMessageId = sentMsg.message_id;

          // Sync to Chatwoot with source_id to prevent re-delivery
          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_NO_XETUX_ID + `\n\n🔗 [Iniciar sesión](${WEBAPP_URL})`,
            message_type: 'outgoing',
            content_attributes: {
              external_created_at: new Date().toISOString(),
            },
            source_id: String(telegramMessageId),
          });
        } else {
          logger.warn({ conversationId: conversation.id }, 'No Telegram user ID found, sending via Chatwoot only');
          // Not a Telegram conversation, send via Chatwoot only
          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_NO_XETUX_ID + `\n\n🔗 ${WEBAPP_URL}`,
            message_type: 'outgoing',
          });
        }
        messageSent = 'welcome_no_xetux_id';
      } else {
        // Has xetux_id: send simple greeting
        if (telegramUserIdNum) {
          const sentMsg = await bot.api.sendMessage(telegramUserIdNum, WELCOME_MESSAGE_WITH_XETUX_ID);
          telegramMessageId = sentMsg.message_id;

          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_WITH_XETUX_ID,
            message_type: 'outgoing',
            content_attributes: {
              external_created_at: new Date().toISOString(),
            },
            source_id: String(telegramMessageId),
          });
        } else {
          logger.warn({ conversationId: conversation.id }, 'No Telegram user ID found, sending via Chatwoot only');
          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_WITH_XETUX_ID,
            message_type: 'outgoing',
          });
        }
        messageSent = 'welcome_with_xetux_id';
      }

      // Auto-assign team based on inbox
      const teamId = INBOX_TO_TEAM[conversation.inbox_id];
      if (teamId) {
        await chatwootService.assignConversation(conversation.id, { team_id: teamId });
        logger.info({ conversationId: conversation.id, teamId }, 'Auto-assigned team');
      }

      return { greeting: messageSent, xetuxId: xetuxId ?? null, teamAssigned: teamId ?? null, telegramMessageId };
    },
  );
}
