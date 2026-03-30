import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/connection.js';
import { chatwootService } from '../services/chatwoot.service.js';
import { logger } from '../utils/logger.js';

export const healthPlugin: FastifyPluginAsync = async (fastify) => {
  // Basic health check (fast, for load balancer)
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  });

  // Deep health check (verifies DB and external dependencies)
  fastify.get('/health/deep', async () => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await pool.query('SELECT 1');
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err: any) {
      checks.database = { status: 'error', latencyMs: Date.now() - dbStart, error: err.message };
    }

    // Pool stats
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pool: poolStats,
      checks,
    };
  });
};
