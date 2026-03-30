import { cleanEnv, str, port, num } from 'envalid';

export const config = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),

  // Database
  DATABASE_URL: str(),
  DATABASE_POOL_MAX: num({ default: 40 }),
  DATABASE_CONNECTION_TIMEOUT_MS: num({ default: 5000 }),
  DATABASE_IDLE_TIMEOUT_MS: num({ default: 30000 }),

  // Telegram
  TELEGRAM_BOT_TOKEN: str(),
  TELEGRAM_WEBHOOK_SECRET: str(),
  WEBHOOK_BASE_URL: str({ default: '' }),
  TELEGRAM_API_RETRIES: num({ default: 3 }),
  TELEGRAM_API_BASE_DELAY_MS: num({ default: 500 }),

  // Chatwoot
  CHATWOOT_BASE_URL: str(),
  CHATWOOT_API_TOKEN: str(),
  CHATWOOT_ACCOUNT_ID: num(),
  CHATWOOT_INBOX_ID: num({ default: 20 }),
  CHATWOOT_WEBHOOK_TOKEN: str({ default: '' }),
  CHATWOOT_API_TIMEOUT_MS: num({ default: 10000 }),
  CHATWOOT_API_RETRIES: num({ default: 3 }),
  HTTP_AGENT_MAX_SOCKETS: num({ default: 15 }),

  // Webapp
  WEBAPP_BASE_URL: str({ default: 'https://xetux2-inbox.zbawxh.easypanel.host/webapp' }),
  LOGO_URL: str({ default: 'https://www.xetux.com/wp-content/uploads/2023/08/logo_xetux.svg' }),

  // OpenAI
  OPENAI_API_KEY: str(),
  OPENAI_MODEL: str({ default: 'gpt-4o-mini' }),
  OPENAI_MAX_TOKENS: num({ default: 500 }),
  OPENAI_TEMPERATURE: num({ default: 0.3 }),

  // Business
  COMPANY_NAME: str({ default: 'Xetux' }),
  SURVEY_FORM_URL: str({ default: 'https://forms.gle/8Tv3jKP5WTziFPqD8' }),

  // Rate limiting
  RATE_LIMIT_MAX: num({ default: 300 }),

  // Webhook concurrency
  WEBHOOK_QUEUE_CONCURRENCY: num({ default: 15 }),

  // Log retention
  LOG_RETENTION_DAYS: num({ default: 30 }),
  LOG_CLEANUP_INTERVAL_HOURS: num({ default: 24 }),
});
