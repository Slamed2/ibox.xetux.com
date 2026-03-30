import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
  allowExitOnIdle: true,
});

export const db = drizzle({ client: pool, schema });
export { pool };
