import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import { MENU_TEXT } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';
import { InlineKeyboard } from 'grammy';

const WEBAPP_BASE_URL = (process.env.WEBHOOK_BASE_URL ?? 'https://xetux2-inbox.zbawxh.easypanel.host') + '/webapp';

const WELCOME_NO_XETUX =
  '¡Bienvenido a Xetux! 🚀\n\n' +
  'Para comenzar, inicia sesión tocando el botón de abajo.\n' +
  'Luego usa el menú para seleccionar el departamento con el que deseas comunicarte.';

const WELCOME_WITH_XETUX =
  '¡Hola! 👋 Gracias por contactarnos.\n\n' +
  'Usa el menú para seleccionar el departamento con el que deseas comunicarte.';

export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  const contact = conversation.contact;
  const xetuxId = contact?.custom_attributes?.xetux_id as string | undefined;
  const telegramUserId = contact?.additional_attributes?.social_telegram_user_id as number | undefined;

  logger.info({ telegramUserId, xetuxId, conversationId: conversation.id }, 'Greeting flow: conversation created');

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
      const webappUrl = `${WEBAPP_BASE_URL}?contact_id=${contact?.id ?? ''}&conversation_id=${conversation.id}`;

      if (!telegramUserId) {
        const content = !xetuxId
          ? WELCOME_NO_XETUX + `\n\n🔗 ${webappUrl}\n\n${MENU_TEXT}`
          : WELCOME_WITH_XETUX + `\n\n${MENU_TEXT}`;
        await chatwootService.sendMessage(conversation.id, { content, message_type: 'outgoing' });
        return { greeting: 'chatwoot_only', xetuxId: xetuxId ?? null };
      }

      let telegramMessageId: number | undefined;

      if (!xetuxId) {
        // No xetux_id: send login button + greeting
        const loginKeyboard = new InlineKeyboard()
          .webApp('🔑 Iniciar sesión', webappUrl);

        const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_NO_XETUX, {
          reply_markup: loginKeyboard,
        });
        telegramMessageId = sentMsg.message_id;

        await chatwootService.sendMessage(conversation.id, {
          content: WELCOME_NO_XETUX + `\n\n🔗 [Iniciar sesión](${webappUrl})\n\n${MENU_TEXT}`,
          message_type: 'outgoing',
          content_attributes: { external_created_at: new Date().toISOString() },
          source_id: String(telegramMessageId),
        });
      } else {
        // Has xetux_id: greeting only
        const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_WITH_XETUX);
        telegramMessageId = sentMsg.message_id;

        await chatwootService.sendMessage(conversation.id, {
          content: WELCOME_WITH_XETUX + `\n\n${MENU_TEXT}`,
          message_type: 'outgoing',
          content_attributes: { external_created_at: new Date().toISOString() },
          source_id: String(telegramMessageId),
        });
      }

      return {
        greeting: !xetuxId ? 'welcome_no_xetux_id' : 'welcome_with_xetux_id',
        xetuxId: xetuxId ?? null,
        telegramMessageId,
      };
    },
  );
}
