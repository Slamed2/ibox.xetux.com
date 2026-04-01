import { FastifyPluginAsync } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryLogs, getLogById, getLogStats, cleanupOldLogs, cleanupPendingLogs, cleanupByStatus } from '../services/execution-log.service.js';
import { registerGroupMigration, getMigratedGroupId } from '../services/telegram.service.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dashboardPlugin: FastifyPluginAsync = async (fastify) => {
  // API routes for the dashboard
  fastify.get<{
    Querystring: {
      eventType?: string;
      status?: string;
      direction?: string;
      chatType?: string;
      search?: string;
      conversationId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/logs', async (request) => {
    const { eventType, status, direction, chatType, search, conversationId, dateFrom, dateTo, page, limit } = request.query;
    return queryLogs({
      eventType,
      status,
      direction,
      chatType,
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

  fastify.post('/api/logs/cleanup', async () => {
    const deleted = await cleanupOldLogs(config.LOG_RETENTION_DAYS);
    return { deleted, retentionDays: config.LOG_RETENTION_DAYS };
  });

  fastify.post('/api/logs/cleanup/pending', async () => {
    const deleted = await cleanupPendingLogs();
    return { deleted };
  });

  fastify.post<{ Params: { status: string } }>('/api/logs/cleanup/:status', async (request) => {
    const { status } = request.params;
    if (!['pending', 'error', 'success'].includes(status)) {
      return { error: 'Invalid status. Use: pending, error, or success' };
    }
    const deleted = await cleanupByStatus(status);
    return { deleted, status };
  });

  // Register a group migration (old group ID → new supergroup ID)
  fastify.post<{ Body: { oldId: number; newId: number } }>('/api/migrations', async (request) => {
    const { oldId, newId } = request.body;
    if (!oldId || !newId) return { error: 'oldId and newId are required' };
    registerGroupMigration(oldId, newId);
    return { ok: true, oldId, newId };
  });

  // Check if a group ID has a migration
  fastify.get<{ Params: { chatId: string } }>('/api/migrations/:chatId', async (request) => {
    const chatId = Number(request.params.chatId);
    const migratedId = getMigratedGroupId(chatId);
    return { chatId, migratedId, isMigrated: migratedId !== chatId };
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
