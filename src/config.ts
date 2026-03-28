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

  // OpenAI
  OPENAI_API_KEY: str(),
});
