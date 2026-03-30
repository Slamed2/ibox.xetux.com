import { cleanEnv, str, port, num } from 'envalid';

export const config = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),

  // Database
  DATABASE_URL: str(),

  // Telegram
  TELEGRAM_BOT_TOKEN: str(),
  TELEGRAM_WEBHOOK_SECRET: str(),

  // Chatwoot
  CHATWOOT_BASE_URL: str(),
  CHATWOOT_API_TOKEN: str(),
  CHATWOOT_ACCOUNT_ID: num(),
  CHATWOOT_INBOX_ID: num({ default: 20 }),
  CHATWOOT_WEBHOOK_TOKEN: str({ default: '' }),
  CHATWOOT_API_TIMEOUT_MS: num({ default: 10000 }),
  CHATWOOT_API_RETRIES: num({ default: 3 }),

  // Webapp
  WEBAPP_BASE_URL: str({ default: 'https://xetux2-inbox.zbawxh.easypanel.host/webapp' }),

  // OpenAI
  OPENAI_API_KEY: str(),

  // Log retention
  LOG_RETENTION_DAYS: num({ default: 30 }),
  LOG_CLEANUP_INTERVAL_HOURS: num({ default: 24 }),
});
