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

// Set to track conversations that already got a greeting (in-memory, resets on restart)
const greetedConversations = new Set<number>();

/**
 * Extract Telegram user ID from any Chatwoot AgentBot webhook payload.
 * Tries multiple paths since the structure varies by event type.
 */
function extractTelegramUserId(payload: ChatwootWebhookPayload): number | undefined {
  const conversation = payload.conversation as any;
  if (!conversation) return undefined;

  const raw = (
    conversation.meta?.sender?.additional_attributes?.social_telegram_user_id ??
    conversation.contact?.additional_attributes?.social_telegram_user_id ??
    conversation.contact_inbox?.source_id ??
    conversation.additional_attributes?.chat_id
  );

  return raw ? Number(raw) : undefined;
}

/**
 * Extract xetux_id from contact custom_attributes.
 */
function extractXetuxId(payload: ChatwootWebhookPayload): string | undefined {
  const conversation = payload.conversation as any;
  if (!conversation) return undefined;

  return (
    conversation.meta?.sender?.custom_attributes?.xetux_id ??
    conversation.contact?.custom_attributes?.xetux_id
  ) as string | undefined;
}

/**
 * Send the greeting message. Can be triggered from conversation_created
 * OR from the first message_created of a new conversation.
 */
export async function sendGreeting(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Don't greet the same conversation twice
  if (greetedConversations.has(conversation.id)) {
    logger.debug({ conversationId: conversation.id }, 'Greeting already sent, skipping');
    return;
  }

  const telegramUserIdNum = extractTelegramUserId(payload);
  const xetuxId = extractXetuxId(payload);

  logger.info({ telegramUserIdNum, xetuxId, conversationId: conversation.id }, 'Greeting flow: sending greeting');

  await withExecutionLog(
    {
      eventType: 'flow:greeting',
      source: 'chatwoot_webhook',
      direction: 'outbound',
      inputData: { conversationId: conversation.id, telegramUserIdNum, xetuxId },
      conversationId: String(conversation.id),
      contactId: String((conversation as any)?.meta?.sender?.id ?? ''),
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

      // Mark as greeted
      greetedConversations.add(conversation.id);

      return { greeting: messageSent, xetuxId: xetuxId ?? null, telegramMessageId };
    },
  );
}

/**
 * Handle conversation_created event (if Chatwoot sends it).
 */
export async function handleConversationCreated(payload: ChatwootWebhookPayload) {
  await sendGreeting(payload);
}

/**
 * Check if a message_created event is the first message and trigger greeting.
 * Called from routing flow before routing logic.
 */
export async function maybeGreetOnFirstMessage(payload: ChatwootWebhookPayload): Promise<boolean> {
  const conversation = payload.conversation as any;
  const message = payload.message;
  if (!conversation || !message) return false;

  // Only greet on incoming messages from contacts
  if (message.message_type !== 'incoming') return false;
  if (message.sender?.type === 'agent_bot') return false;

  // Already greeted this conversation
  if (greetedConversations.has(conversation.id)) return false;

  // Check if this is a new conversation: status is "pending" means no agent has replied yet
  // Also check messages array — if it only has 1 message, it's likely the first one
  const messages = conversation.messages;
  const isPending = conversation.status === 'pending';
  const isFirstMessage = Array.isArray(messages) && messages.length <= 1;

  if (isPending || isFirstMessage) {
    logger.info({ conversationId: conversation.id, status: conversation.status, messageCount: messages?.length }, 'First message detected, triggering greeting');
    await sendGreeting(payload);
    return true;
  }

  return false;
}
