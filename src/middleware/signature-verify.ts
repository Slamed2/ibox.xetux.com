import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { WebhookVerificationError } from '../utils/errors.js';

export async function verifyChatwootSignature(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const signature = request.headers['x-chatwoot-signature'] as string | undefined;

  if (!signature) {
    logger.warn('Chatwoot webhook received without X-Chatwoot-Signature header');
    throw new WebhookVerificationError('Missing X-Chatwoot-Signature header');
  }

  // Use the raw body preserved by the content type parser for accurate HMAC
  const rawBody = (request as any).rawBody as string | undefined ?? JSON.stringify(request.body);
  const expectedSignature = crypto
    .createHmac('sha256', config.CHATWOOT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  )) {
    logger.warn({ receivedSignature: signature, expectedSignature }, 'Chatwoot webhook signature mismatch');
    throw new WebhookVerificationError();
  }
}
