import { FastifyPluginAsync } from 'fastify';
import { handleConversationCreated } from '../flows/greeting.flow.js';
import { handleMessageCreated } from '../flows/routing.flow.js';
import { handleConversationResolved } from '../flows/closing.flow.js';
import { handleConversationUpdated } from '../flows/assignment.flow.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

export const chatwootPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post('/chatwoot', async (request, reply) => {
    const payload = request.body as ChatwootWebhookPayload & Record<string, unknown>;
    const event = payload.event;

    // Log full payload for debugging
    logger.info({ event, keys: Object.keys(payload), conversationId: payload.conversation?.id }, 'Chatwoot webhook received');

    // Log every webhook event to dashboard for visibility
    withExecutionLog(
      {
        eventType: `chatwoot:${event ?? 'unknown'}`,
        source: 'chatwoot_webhook',
        direction: 'inbound',
        inputData: payload,
        conversationId: String(payload.conversation?.id ?? payload.id ?? ''),
        contactId: String(payload.conversation?.contact?.id ?? ''),
        metadata: { eventRaw: event, payloadKeys: Object.keys(payload) },
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
