import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 40,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true,
});

export const db = drizzle({ client: pool, schema });
export { pool };
