import { FastifyPluginAsync } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryLogs, getLogById, getLogStats } from '../services/execution-log.service.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dashboardPlugin: FastifyPluginAsync = async (fastify) => {
  // API routes for the dashboard
  fastify.get<{
    Querystring: {
      eventType?: string;
      status?: string;
      direction?: string;
      search?: string;
      conversationId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/logs', async (request) => {
    const { eventType, status, direction, search, conversationId, dateFrom, dateTo, page, limit } = request.query;
    return queryLogs({
      eventType,
      status,
      direction,
      search,
      conversationId,
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

  // Serve dashboard static files (only if public dir exists)
  const publicDir = path.resolve(__dirname, '../../public');
  if (fs.existsSync(publicDir)) {
    await fastify.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
      wildcard: true,
      decorateReply: true,
    });

    // SPA fallback: serve index.html for all non-API, non-webhook routes
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/webhook/') || request.url === '/health') {
        reply.code(404);
        return { error: 'Not found' };
      }
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn('Dashboard public directory not found, skipping static file serving');
    fastify.setNotFoundHandler(async (_request, reply) => {
      reply.code(404);
      return { error: 'Not found' };
    });
  }
};
