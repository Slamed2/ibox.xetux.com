import Fastify from 'fastify';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { db } from './db/connection.js';
import { healthPlugin } from './plugins/health.plugin.js';
import { chatwootPlugin } from './plugins/chatwoot.plugin.js';
import { telegramPlugin } from './plugins/telegram.plugin.js';
import { dashboardPlugin } from './plugins/dashboard.plugin.js';

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

// Plugins
await app.register(healthPlugin);
await app.register(chatwootPlugin, { prefix: '/webhook' });
await app.register(telegramPlugin, { prefix: '/webhook' });
await app.register(dashboardPlugin);

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down...`);
  await app.close();
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
