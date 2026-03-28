import { chatwootService } from '../services/chatwoot.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot, enableUserCommands, resetUserCommands, consumePendingDeepLinkXetuxId } from '../services/telegram.service.js';
import { MENU_TEXT, TEAMS } from '../services/department-menu.js';
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
      // Check if there's a pending xetux_id from a deep link
      const deepLinkXetuxId = telegramUserId ? consumePendingDeepLinkXetuxId(telegramUserId) : null;
      const effectiveXetuxId = xetuxId ?? deepLinkXetuxId;

      // If deep link provided xetux_id, update the contact now
      if (deepLinkXetuxId && !xetuxId && contact?.id) {
        const isMX = deepLinkXetuxId.toUpperCase().startsWith('MX');
        await chatwootService.updateContact(contact.id, {
          additional_attributes: { country: isMX ? 'Mexico' : 'Venezuela', country_code: isMX ? 'MX' : 'VE' },
          custom_attributes: { xetux_id: deepLinkXetuxId },
        });
        logger.info({ contactId: contact.id, xetuxId: deepLinkXetuxId }, 'Contact updated via deep link in greeting flow');
      }

      let webappUrl = `${WEBAPP_BASE_URL}?contact_id=${contact?.id ?? ''}&conversation_id=${conversation.id}`;
      // Pass deep link xetux_id to webapp so field is pre-filled
      if (deepLinkXetuxId && !xetuxId) {
        webappUrl += `&xetux_id=${encodeURIComponent(deepLinkXetuxId)}`;
      }

      // Add country label and set commands based on user state
      if (effectiveXetuxId) {
        const countryLabel = effectiveXetuxId.toUpperCase().startsWith('MX') ? 'mexico' : 'venezuela';
        await chatwootService.addLabels(conversation.id, [countryLabel]);
        if (telegramUserId) {
          await enableUserCommands(telegramUserId);
        }
      } else if (telegramUserId) {
        // No xetux_id: reset to guest menu (handles deleted contacts)
        await resetUserCommands(telegramUserId);
      }

      if (!telegramUserId) {
        const content = !effectiveXetuxId
          ? WELCOME_NO_XETUX + `\n\n🔗 ${webappUrl}\n\n${MENU_TEXT}`
          : WELCOME_WITH_XETUX + `\n\n${MENU_TEXT}`;
        await chatwootService.sendMessage(conversation.id, { content, message_type: 'outgoing' });
        return { greeting: 'chatwoot_only', xetuxId: effectiveXetuxId ?? null };
      }

      let telegramMessageId: number | undefined;

      if (!effectiveXetuxId) {
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
      } else if (deepLinkXetuxId && !xetuxId) {
        // Deep link: xetux_id known but need to complete registration — show webapp + greeting
        const loginKeyboard = new InlineKeyboard()
          .webApp('🔑 Completar registro', webappUrl);

        const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_NO_XETUX, {
          reply_markup: loginKeyboard,
        });
        telegramMessageId = sentMsg.message_id;

        await chatwootService.sendMessage(conversation.id, {
          content: WELCOME_NO_XETUX + `\n\n🔗 [Completar registro](${webappUrl})\n\n${MENU_TEXT}`,
          message_type: 'outgoing',
          content_attributes: { external_created_at: new Date().toISOString() },
          source_id: String(telegramMessageId),
        });
      } else {
        // Has xetux_id: greeting + department buttons
        const country = effectiveXetuxId!.toUpperCase().startsWith('MX') ? 'mx' : 've';
        const deptKeyboard = new InlineKeyboard()
          .text('💼 Consultoría', `team:${country === 'mx' ? TEAMS.CONSULTORIA_MX : TEAMS.CONSULTORIA_VE}:Consultoría`)
          .text('🛠 Soporte', `team:${country === 'mx' ? TEAMS.SOPORTE_MX : TEAMS.SOPORTE_VE}:Soporte`)
          .row()
          .text('🛒 Ventas', `team:${country === 'mx' ? TEAMS.VENTAS_MX : TEAMS.VENTAS_VE}:Ventas`)
          .text('📋 Administración', `team:${country === 'mx' ? TEAMS.ADMINISTRACION_MX : TEAMS.ADMINISTRACION_VE}:Administración`);

        const sentMsg = await bot.api.sendMessage(telegramUserId, WELCOME_WITH_XETUX, {
          reply_markup: deptKeyboard,
        });
        telegramMessageId = sentMsg.message_id;

        await chatwootService.sendMessage(conversation.id, {
          content: WELCOME_WITH_XETUX + `\n\n${MENU_TEXT}`,
          message_type: 'outgoing',
          content_attributes: { external_created_at: new Date().toISOString() },
          source_id: String(telegramMessageId),
        });
      }

      return {
        greeting: !effectiveXetuxId ? 'welcome_no_xetux_id' : deepLinkXetuxId ? 'welcome_deep_link' : 'welcome_with_xetux_id',
        xetuxId: effectiveXetuxId ?? null,
        deepLinkXetuxId: deepLinkXetuxId ?? null,
        telegramMessageId,
      };
    },
  );
}
