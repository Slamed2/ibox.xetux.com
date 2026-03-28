import { FastifyPluginAsync } from 'fastify';
import { handleConversationCreated } from '../flows/greeting.flow.js';
import { handleMessageCreated } from '../flows/routing.flow.js';
import { handleConversationResolved } from '../flows/closing.flow.js';
import { handleConversationUpdated } from '../flows/assignment.flow.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

/**
 * Normalize Chatwoot webhook payload.
 * Normal webhooks send conversation data at the root level (not nested in .conversation).
 * We normalize it so all flows receive a consistent structure with .conversation.
 */
function normalizePayload(raw: Record<string, unknown>): ChatwootWebhookPayload {
  const event = raw.event as string;

  // If payload already has .conversation, use as-is
  if (raw.conversation) {
    return raw as unknown as ChatwootWebhookPayload;
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
    const raw = request.body as Record<string, unknown>;
    const event = raw.event as string;
    const payload = normalizePayload(raw);

    const inboxId = payload.conversation?.inbox_id ?? (raw.inbox_id as number);

    // Only process events from inbox 20 (Telegram) and from contacts
    if (inboxId && inboxId !== 20) {
      logger.debug({ event, inboxId }, 'Ignoring event from non-Telegram inbox');
      return { status: 'ok' };
    }

    // Skip events triggered by agents/bots (only process contact-originated events)
    const messageSenderType = payload.message?.sender?.type;
    if (messageSenderType && messageSenderType !== 'contact') {
      logger.debug({ event, senderType: messageSenderType }, 'Ignoring non-contact message');
      return { status: 'ok' };
    }

    const conversationId = payload.conversation?.id ?? (raw.id as number);
    logger.info({ event, inboxId, conversationId }, 'Chatwoot webhook received');

    // Log every webhook event to dashboard for visibility
    withExecutionLog(
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
        // Dispatch to the correct flow handler
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

          default:
            return { action: 'unhandled', event };
        }
      },
    ).catch(err => logger.error({ err, event }, 'Error processing Chatwoot webhook'));

    return { status: 'ok' };
  });
};
