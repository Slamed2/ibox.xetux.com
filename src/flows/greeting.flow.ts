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

export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  const contact = conversation.contact;
  const xetuxId = contact?.custom_attributes?.xetux_id as string | undefined;

  // Telegram user ID from contact additional_attributes
  const telegramUserId = contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  logger.info({ telegramUserId, xetuxId, conversationId: conversation.id, contactId: contact?.id }, 'Greeting flow: conversation created');

  await withExecutionLog(
    {
      eventType: 'flow:greeting',
      source: 'chatwoot_webhook',
      direction: 'outbound',
      inputData: { conversationId: conversation.id, telegramUserId, xetuxId },
      conversationId: String(conversation.id),
      contactId: String(contact?.id ?? ''),
      metadata: { xetuxId: xetuxId ?? null, telegramUserId: telegramUserId ?? null },
    },
    async () => {
      let messageSent: string;
      let telegramMessageId: number | undefined;

      if (!xetuxId) {
        if (telegramUserId) {
          const keyboard = new InlineKeyboard()
            .webApp('Iniciar sesión', WEBAPP_URL);

          const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_MESSAGE_NO_XETUX_ID, {
            reply_markup: keyboard,
          });
          telegramMessageId = sentMsg.message_id;

          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_NO_XETUX_ID + `\n\n🔗 [Iniciar sesión](${WEBAPP_URL})`,
            message_type: 'outgoing',
            content_attributes: {
              external_created_at: new Date().toISOString(),
            },
            source_id: String(telegramMessageId),
          });
        } else {
          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_NO_XETUX_ID + `\n\n🔗 ${WEBAPP_URL}`,
            message_type: 'outgoing',
          });
        }
        messageSent = 'welcome_no_xetux_id';
      } else {
        if (telegramUserId) {
          const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_MESSAGE_WITH_XETUX_ID);
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
          await chatwootService.sendMessage(conversation.id, {
            content: WELCOME_MESSAGE_WITH_XETUX_ID,
            message_type: 'outgoing',
          });
        }
        messageSent = 'welcome_with_xetux_id';
      }

      return { greeting: messageSent, xetuxId: xetuxId ?? null, telegramMessageId };
    },
  );
}
