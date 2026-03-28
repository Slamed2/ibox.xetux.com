import { Keyboard } from 'grammy';

// Team IDs from Chatwoot
export const TEAMS = {
  SOPORTE_MX: 1,
  SOPORTE_VE: 2,
  CONSULTORIA_VE: 5,
  VENTAS: 6,
  ADMINISTRACION: 7,
  CONSULTORIA_MX: 8,
} as const;

// Team ID → Chatwoot label mapping
export const TEAM_LABELS: Record<number, string> = {
  [TEAMS.SOPORTE_MX]: 'soporte-mexico',
  [TEAMS.SOPORTE_VE]: 'soporte-venezuela',
  [TEAMS.CONSULTORIA_VE]: 'consultoria-venezuela',
  [TEAMS.VENTAS]: 'ventas',
  [TEAMS.ADMINISTRACION]: 'administracion',
  [TEAMS.CONSULTORIA_MX]: 'consultoria-mexico',
};

// Command → department mapping for direct departments (no country needed)
export const DIRECT_COMMANDS: Record<string, { teamId: number; label: string }> = {
  ventas: { teamId: TEAMS.VENTAS, label: 'Ventas' },
  administracion: { teamId: TEAMS.ADMINISTRACION, label: 'Administración' },
};

// Commands that need country selection
export const COUNTRY_COMMANDS: Record<string, Record<string, { teamId: number; label: string }>> = {
  consultoria: {
    '🇲🇽 México': { teamId: TEAMS.CONSULTORIA_MX, label: 'Consultoría México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.CONSULTORIA_VE, label: 'Consultoría Venezuela' },
  },
  soporte: {
    '🇲🇽 México': { teamId: TEAMS.SOPORTE_MX, label: 'Soporte México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.SOPORTE_VE, label: 'Soporte Venezuela' },
  },
};

// Country selection keyboard (one-time, disappears after selection)
export const COUNTRY_KEYBOARD = new Keyboard()
  .text('🇲🇽 México').text('🇻🇪 Venezuela')
  .resized()
  .oneTime();

export const COUNTRY_BUTTONS = new Set<string>(['🇲🇽 México', '🇻🇪 Venezuela']);

// Bot commands to register in Telegram menu
export const BOT_COMMANDS = [
  { command: 'consultoria', description: '💼 Chatear con Consultoría' },
  { command: 'soporte', description: '🛠 Chatear con Soporte' },
  { command: 'ventas', description: '🛒 Chatear con Ventas' },
  { command: 'administracion', description: '📋 Chatear con Administración' },
];

// Text representation for Chatwoot sync
export const MENU_TEXT =
  '💼 /consultoria | 🛠 /soporte | 🛒 /ventas | 📋 /administracion';
