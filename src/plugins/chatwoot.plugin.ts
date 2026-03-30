import { FastifyPluginAsync } from 'fastify';
import { handleConversationCreated } from '../flows/greeting.flow.js';
import { handleMessageCreated } from '../flows/routing.flow.js';
import { handleConversationResolved } from '../flows/closing.flow.js';
import { handleConversationUpdated } from '../flows/assignment.flow.js';
import { handleMessageUpdated } from '../flows/message-update.flow.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { resetUserCommands } from '../services/telegram.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TaskQueue } from '../utils/task-queue.js';

// Limit concurrent webhook processing to prevent resource exhaustion
const webhookQueue = new TaskQueue(15);

/**
 * Normalize Chatwoot webhook payload.
 * Normal webhooks send conversation data at the root level (not nested in .conversation).
 * We normalize it so all flows receive a consistent structure with .conversation.
 */
function normalizePayload(raw: Record<string, unknown>): ChatwootWebhookPayload {
  const event = raw.event as string;

  // When raw.conversation exists, message data lives at root level (not under .message).
  // Build the .message object and ensure .conversation.contact is populated.
  if (raw.conversation) {
    const payload = raw as any;

    // message_created / message_updated: message fields are at root
    if ((event === 'message_created' || event === 'message_updated') && !payload.message) {
      payload.message = {
        id: raw.id,
        content: raw.content,
        message_type: raw.message_type,
        content_type: raw.content_type,
        sender: raw.sender,
        source_id: raw.source_id,
        created_at: raw.created_at,
        conversation_id: (raw.conversation as any)?.id,
      };
    }

    // Ensure conversation.contact is populated from meta.sender
    const conv = payload.conversation;
    if (!conv.contact && conv.meta?.sender) {
      conv.contact = conv.meta.sender;
    }

    return payload as ChatwootWebhookPayload;
  }

  // Normal webhook: conversation data is at root level
  // Build a normalized payload with .conversation
  const conversation = {
    id: raw.id as number,
    account_id: (raw.account as any)?.id ?? raw.account_id,
    inbox_id: raw.inbox_id as number,
    status: raw.status as string,
    assignee_id: raw.assignee_id as number | undefined,
    team_id: raw.team_id as number | undefined,
    labels: raw.labels as string[] ?? [],
    custom_attributes: raw.custom_attributes as Record<string, unknown> ?? {},
    additional_attributes: raw.additional_attributes as Record<string, unknown> ?? {},
    // Contact is in meta.sender for normal webhooks
    contact: (raw.meta as any)?.sender ?? null,
    contact_inbox: raw.contact_inbox,
    meta: raw.meta,
    messages: raw.messages,
  };

  // For message_created, the first message in messages array is the message
  const messages = raw.messages as any[] | undefined;
  const message = messages?.[messages.length - 1] ?? null;

  return {
    event,
    conversation,
    message,
    changed_attributes: raw.changed_attributes,
  } as unknown as ChatwootWebhookPayload;
}

export const chatwootPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post('/chatwoot', async (request, reply) => {
    // Webhook token verification (skip if not configured)
    if (config.CHATWOOT_WEBHOOK_TOKEN) {
      const token = request.headers['x-chatwoot-webhook-token'] as string | undefined;
      if (token !== config.CHATWOOT_WEBHOOK_TOKEN) {
        logger.warn({ ip: request.ip }, 'Chatwoot webhook rejected: invalid token');
        reply.code(401);
        return { error: 'Unauthorized' };
      }
    }

    const raw = request.body as Record<string, unknown>;
    const event = raw.event as string;
    const payload = normalizePayload(raw);

    const inboxId = payload.conversation?.inbox_id ?? (raw.inbox_id as number);

    // Only process events from inbox 20 (Telegram) and from contacts
    if (inboxId && inboxId !== config.CHATWOOT_INBOX_ID) {
      logger.debug({ event, inboxId }, 'Ignoring event from non-Telegram inbox');
      return { status: 'ok' };
    }

    // Skip message_created events triggered by agents/bots (only process contact messages)
    if (event === 'message_created') {
      const messageSenderType = payload.message?.sender?.type;
      if (messageSenderType && messageSenderType !== 'contact') {
        logger.debug({ event, senderType: messageSenderType }, 'Ignoring non-contact message');
        return { status: 'ok' };
      }
    }

    const conversationId = payload.conversation?.id ?? (raw.id as number);
    logger.info({ event, inboxId, conversationId }, 'Chatwoot webhook received');

    // Process webhook in background with concurrency limit
    webhookQueue.enqueue(async () => {
      try {
        await withExecutionLog(
          {
            eventType: `chatwoot:${event ?? 'unknown'}`,
            source: 'chatwoot_webhook',
            direction: 'inbound',
            inputData: raw,
            conversationId: String(conversationId ?? ''),
            contactId: String(payload.conversation?.contact?.id ?? ''),
            metadata: { eventRaw: event, payloadKeys: Object.keys(raw) },
          },
          async () => {
            switch (event) {
              case 'conversation_created':
                await handleConversationCreated(payload);
                return { action: 'greeting_flow' };

              case 'message_created':
                await handleMessageCreated(payload);
                return { action: 'routing_flow' };

              case 'conversation_status_changed':
                await handleConversationResolved(payload);
                return { action: 'closing_flow' };

              case 'conversation_updated':
                await handleConversationUpdated(payload);
                return { action: 'assignment_flow' };

              case 'message_updated':
                await handleMessageUpdated(raw);
                return { action: 'message_updated_flow' };

              case 'contact_updated': {
                const changedAttrs = raw.changed_attributes as any[] | undefined;
                const telegramUserId = (raw.additional_attributes as any)?.social_telegram_user_id as number | undefined;
                if (changedAttrs && telegramUserId) {
                  const customAttrsChange = changedAttrs.find((c: any) => c.custom_attributes);
                  if (customAttrsChange) {
                    const prev = customAttrsChange.custom_attributes?.previous_value ?? {};
                    const curr = customAttrsChange.custom_attributes?.current_value ?? {};
                    if (prev.xetux_id && !curr.xetux_id) {
                      await resetUserCommands(telegramUserId);
                      return { event: 'contact_updated', action: 'menu_reset', telegramUserId };
                    }
                  }
                }
                return { event: 'contact_updated', action: 'unhandled' };
              }

              default:
                return { action: 'unhandled', event };
            }
          },
        );
      } catch (err) {
        logger.error({ err, event }, 'Error processing Chatwoot webhook');
      }
    });

    return { status: 'ok' };
  });
};
