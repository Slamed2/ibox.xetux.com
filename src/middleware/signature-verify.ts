import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function verifyChatwootSignature(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const signature = request.headers['x-chatwoot-signature'] as string | undefined;

  if (!signature) {
    logger.warn('Chatwoot webhook: missing X-Chatwoot-Signature header');
    reply.code(401).send({ error: 'Missing signature' });
    return;
  }

  const rawBody = (request as any).rawBody as string | undefined ?? JSON.stringify(request.body);
  const expectedSignature = crypto
    .createHmac('sha256', config.CHATWOOT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  )) {
    logger.warn({ receivedSignature: signature, expectedSignature }, 'Chatwoot webhook: signature mismatch');
    reply.code(401).send({ error: 'Invalid signature' });
    return;
  }
}
