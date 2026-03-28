import { FastifyPluginAsync } from 'fastify';
import { verifyChatwootSignature } from '../middleware/signature-verify.js';
import { handleConversationCreated } from '../flows/greeting.flow.js';
import { handleMessageCreated } from '../flows/routing.flow.js';
import { handleConversationResolved } from '../flows/closing.flow.js';
import { handleConversationUpdated } from '../flows/assignment.flow.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

export const chatwootPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ChatwootWebhookPayload }>('/chatwoot', {
    preHandler: verifyChatwootSignature,
  }, async (request, reply) => {
    const payload = request.body;
    const event = payload.event;

    logger.info({ event, conversationId: payload.conversation?.id }, 'Chatwoot webhook received');

    // Dispatch to the correct flow handler (fire-and-forget to respond quickly)
    try {
      switch (event) {
        case 'conversation_created':
          // Don't await - respond to webhook quickly, process async
          handleConversationCreated(payload).catch(err =>
            logger.error({ err, event }, 'Error in greeting flow'));
          break;

        case 'message_created':
          handleMessageCreated(payload).catch(err =>
            logger.error({ err, event }, 'Error in routing flow'));
          break;

        case 'conversation_status_changed':
          handleConversationResolved(payload).catch(err =>
            logger.error({ err, event }, 'Error in closing flow'));
          break;

        case 'conversation_updated':
          handleConversationUpdated(payload).catch(err =>
            logger.error({ err, event }, 'Error in assignment flow'));
          break;

        default:
          withExecutionLog(
            {
              eventType: `chatwoot:${event}`,
              source: 'chatwoot_webhook',
              direction: 'inbound',
              inputData: payload,
              conversationId: String(payload.conversation?.id ?? ''),
              contactId: String(payload.conversation?.contact?.id ?? ''),
            },
            async () => ({ action: 'unhandled', event }),
          ).catch(err => logger.error({ err, event }, 'Error logging unhandled event'));
      }
    } catch (err) {
      logger.error({ err, event }, 'Error dispatching Chatwoot event');
    }

    return { status: 'ok' };
  });
};
