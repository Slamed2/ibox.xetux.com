import { FastifyPluginAsync } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryLogs, getLogById, getLogStats } from '../services/execution-log.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dashboardPlugin: FastifyPluginAsync = async (fastify) => {
  // API routes for the dashboard
  fastify.get<{
    Querystring: {
      eventType?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/logs', async (request) => {
    const { eventType, status, dateFrom, dateTo, page, limit } = request.query;
    return queryLogs({
      eventType,
      status,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/logs/:id', async (request, reply) => {
    const log = await getLogById(request.params.id);
    if (!log) {
      reply.code(404);
      return { error: 'Log not found' };
    }
    return log;
  });

  fastify.get('/api/logs/stats', async () => {
    return getLogStats();
  });

  // Serve dashboard static files
  const publicDir = path.resolve(__dirname, '../../public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for all non-API, non-webhook routes
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/webhook/') || request.url === '/health') {
      reply.code(404);
      return { error: 'Not found' };
    }
    return reply.sendFile('index.html');
  });
};
