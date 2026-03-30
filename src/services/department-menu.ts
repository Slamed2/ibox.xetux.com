import { Keyboard } from 'grammy';

// Team IDs from Chatwoot
export const TEAMS = {
  SOPORTE_MX: 1,
  SOPORTE_VE: 2,
  CONSULTORIA_VE: 5,
  VENTAS_MX: 9,
  VENTAS_VE: 10,
  ADMINISTRACION_MX: 11,
  ADMINISTRACION_VE: 12,
  CONSULTORIA_MX: 8,
} as const;

// Old team IDs (kept for backward compatibility with existing conversations)
export const LEGACY_TEAMS = {
  VENTAS: 6,
  ADMINISTRACION: 7,
} as const;

// Team ID → Chatwoot label mapping
export const TEAM_LABELS: Record<number, string> = {
  [TEAMS.SOPORTE_MX]: 'soporte-mexico',
  [TEAMS.SOPORTE_VE]: 'soporte-venezuela',
  [TEAMS.CONSULTORIA_VE]: 'consultoria-venezuela',
  [TEAMS.CONSULTORIA_MX]: 'consultoria-mexico',
  [TEAMS.VENTAS_MX]: 'ventas-mexico',
  [TEAMS.VENTAS_VE]: 'ventas-venezuela',
  [TEAMS.ADMINISTRACION_MX]: 'administracion-mexico',
  [TEAMS.ADMINISTRACION_VE]: 'administracion-venezuela',
  // Legacy
  [LEGACY_TEAMS.VENTAS]: 'ventas',
  [LEGACY_TEAMS.ADMINISTRACION]: 'administracion',
};

// All department label values — used to remove old department labels before adding a new one
export const ALL_DEPARTMENT_LABELS = Object.values(TEAM_LABELS);

// Team names for display
export const TEAM_NAMES: Record<number, string> = {
  [TEAMS.SOPORTE_MX]: 'Soporte México',
  [TEAMS.SOPORTE_VE]: 'Soporte Venezuela',
  [TEAMS.CONSULTORIA_MX]: 'Consultoría México',
  [TEAMS.CONSULTORIA_VE]: 'Consultoría Venezuela',
  [TEAMS.VENTAS_MX]: 'Ventas México',
  [TEAMS.VENTAS_VE]: 'Ventas Venezuela',
  [TEAMS.ADMINISTRACION_MX]: 'Administración México',
  [TEAMS.ADMINISTRACION_VE]: 'Administración Venezuela',
  [LEGACY_TEAMS.VENTAS]: 'Ventas',
  [LEGACY_TEAMS.ADMINISTRACION]: 'Administración',
};

// All departments now require country — resolved by xetux_id prefix
export const COUNTRY_COMMANDS: Record<string, Record<string, { teamId: number; label: string }>> = {
  consultoria: {
    '🇲🇽 México': { teamId: TEAMS.CONSULTORIA_MX, label: 'Consultoría México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.CONSULTORIA_VE, label: 'Consultoría Venezuela' },
  },
  soporte: {
    '🇲🇽 México': { teamId: TEAMS.SOPORTE_MX, label: 'Soporte México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.SOPORTE_VE, label: 'Soporte Venezuela' },
  },
  ventas: {
    '🇲🇽 México': { teamId: TEAMS.VENTAS_MX, label: 'Ventas México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.VENTAS_VE, label: 'Ventas Venezuela' },
  },
  administracion: {
    '🇲🇽 México': { teamId: TEAMS.ADMINISTRACION_MX, label: 'Administración México' },
    '🇻🇪 Venezuela': { teamId: TEAMS.ADMINISTRACION_VE, label: 'Administración Venezuela' },
  },
};

// Country selection keyboard (one-time, disappears after selection)
export const COUNTRY_KEYBOARD = new Keyboard()
  .text('🇲🇽 México').text('🇻🇪 Venezuela')
  .resized()
  .oneTime();

export const COUNTRY_BUTTONS = new Set<string>(['🇲🇽 México', '🇻🇪 Venezuela']);

// Bot commands for unregistered users
export const GUEST_COMMANDS = [
  { command: 'registro', description: '🔑 Iniciar sesión' },
];

// Bot commands for registered users
export const BOT_COMMANDS = [
  { command: 'consultoria', description: '💼 Chatear con Consultoría' },
  { command: 'soporte', description: '🛠 Chatear con Soporte' },
  { command: 'ventas', description: '🛒 Chatear con Ventas' },
  { command: 'administracion', description: '📋 Chatear con Administración' },
];

// Text representation for Chatwoot sync
export const MENU_TEXT =
  '💼 /consultoria | 🛠 /soporte | 🛒 /ventas | 📋 /administracion';
