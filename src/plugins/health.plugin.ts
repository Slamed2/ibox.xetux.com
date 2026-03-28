import { FastifyPluginAsync } from 'fastify';

export const healthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};
