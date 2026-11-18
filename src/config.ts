import { cleanEnv, str, port, num, bool } from 'envalid';

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
  // Interruptor de emergencia (16-nov-2026). En true, ibox NO hace ninguna llamada
  // a la API de Telegram: ni saludos, ni menús, ni avisos de asignación o cierre,
  // ni la configuración del arranque. Sigue recibiendo las actualizaciones de
  // Telegram y pasándolas a Chatwoot, y sigue asignando equipos en Chatwoot.
  // Las respuestas escritas por los agentes no pasan por ibox: las envía Chatwoot.
  TELEGRAM_ENVIOS_PAUSADOS: bool({ default: false }),
  // Usuario del bot. Solo se usa con los envíos pausados, para que grammY pueda
  // identificarse sin llamar a getMe.
  TELEGRAM_BOT_USERNAME: str({ default: 'xetuxBot' }),
  // Tamaño máximo que el bot puede descargar. 20 MB con la nube de Telegram; con el servidor
  // propio en modo local (18-nov-2026) son 2000 MB. Por encima, ibox pide al cliente subir el video.
  TELEGRAM_MAX_DOWNLOAD_MB: num({ default: 20 }),

  // Chatwoot
  CHATWOOT_BASE_URL: str(),
  CHATWOOT_API_TOKEN: str(),
  CHATWOOT_ACCOUNT_ID: num(),
  CHATWOOT_INBOX_ID: num({ default: 20 }),
  CHATWOOT_WEBHOOK_TOKEN: str({ default: '' }),
  CHATWOOT_API_TIMEOUT_MS: num({ default: 10000 }),
  CHATWOOT_API_RETRIES: num({ default: 3 }),
  HTTP_AGENT_MAX_SOCKETS: num({ default: 15 }),

  // Auto-asignación a Soporte de conversaciones sin rutear (cliente que no
  // eligió departamento). Encendida por defecto desde el 28-oct-2026: el barrido
  // es 1 página de conversaciones cada N min. Apagar con AUTO_ASSIGN_ENABLED=false.
  AUTO_ASSIGN_ENABLED: bool({ default: true }),
  AUTO_ASSIGN_AGE_MINUTES: num({ default: 10 }),   // antigüedad (desde creación) para asignar
  AUTO_ASSIGN_MAX_AGE_HOURS: num({ default: 24 }), // más antiguas no se tocan: el cliente recibiría
                                                   // «te transferí…» días después de escribir
  AUTO_ASSIGN_SWEEP_MINUTES: num({ default: 2 }),  // frecuencia del barrido

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
