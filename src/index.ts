import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { db, pool } from './db/connection.js';
import { healthPlugin } from './plugins/health.plugin.js';
import { chatwootPlugin } from './plugins/chatwoot.plugin.js';
import { telegramPlugin } from './plugins/telegram.plugin.js';
import { dashboardPlugin } from './plugins/dashboard.plugin.js';
import { webappPlugin } from './plugins/webapp.plugin.js';
import { cleanupOldLogs } from './services/execution-log.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Run database migrations on startup
try {
  logger.info('Running database migrations...');
  await migrate(db, { migrationsFolder: path.resolve(__dirname, './db/migrations') });
  logger.info('Database migrations completed');
} catch (err) {
  logger.error(err, 'Failed to run database migrations');
  process.exit(1);
}

const app = Fastify({ logger: false });

// Rate limiting — protects against webhook floods
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  allowList: (req) => req.url?.startsWith('/health') ?? false,
});

// Plugins
await app.register(healthPlugin);
await app.register(chatwootPlugin, { prefix: '/webhook' });
await app.register(telegramPlugin, { prefix: '/webhook' });
await app.register(webappPlugin);
await app.register(dashboardPlugin);

// Log cleanup scheduler
const runCleanup = async () => {
  try {
    const deleted = await cleanupOldLogs(config.LOG_RETENTION_DAYS);
    if (deleted > 0) logger.info({ deleted, retentionDays: config.LOG_RETENTION_DAYS }, 'Scheduled log cleanup completed');
  } catch (err) {
    logger.error(err, 'Scheduled log cleanup failed');
  }
};
runCleanup(); // Run on startup
const cleanupInterval = setInterval(runCleanup, config.LOG_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000);

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down...`);
  clearInterval(cleanupInterval);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start
try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`Server running on port ${config.PORT}`);
} catch (err) {
  logger.error(err, 'Failed to start server');
  process.exit(1);
}
