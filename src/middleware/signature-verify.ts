import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { WebhookVerificationError } from '../utils/errors.js';

export async function verifyChatwootSignature(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const signature = request.headers['x-chatwoot-signature'] as string | undefined;

  if (!signature) {
    throw new WebhookVerificationError('Missing X-Chatwoot-Signature header');
  }

  const rawBody = JSON.stringify(request.body);
  const expectedSignature = crypto
    .createHmac('sha256', config.CHATWOOT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  )) {
    throw new WebhookVerificationError();
  }
}
