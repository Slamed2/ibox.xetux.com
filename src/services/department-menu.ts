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

// Button labels (exact text the user sends when tapping)
export const BTN = {
  CONSULTORIA: '💼 Consultoría',
  SOPORTE: '🛠 Soporte',
  VENTAS: '🛒 Ventas',
  ADMINISTRACION: '📋 Administración',
  MEXICO: '🇲🇽 México',
  VENEZUELA: '🇻🇪 Venezuela',
} as const;

// Direct departments — no country needed
export const DIRECT_DEPARTMENTS: Record<string, { teamId: number; label: string }> = {
  [BTN.VENTAS]: { teamId: TEAMS.VENTAS, label: 'Ventas' },
  [BTN.ADMINISTRACION]: { teamId: TEAMS.ADMINISTRACION, label: 'Administración' },
};

// Departments that need country selection
export const NEEDS_COUNTRY = new Set<string>([BTN.CONSULTORIA, BTN.SOPORTE]);

// Department + country → team mapping
export const DEPT_COUNTRY_TEAMS: Record<string, Record<string, { teamId: number; label: string }>> = {
  [BTN.CONSULTORIA]: {
    [BTN.MEXICO]: { teamId: TEAMS.CONSULTORIA_MX, label: 'Consultoría México' },
    [BTN.VENEZUELA]: { teamId: TEAMS.CONSULTORIA_VE, label: 'Consultoría Venezuela' },
  },
  [BTN.SOPORTE]: {
    [BTN.MEXICO]: { teamId: TEAMS.SOPORTE_MX, label: 'Soporte México' },
    [BTN.VENEZUELA]: { teamId: TEAMS.SOPORTE_VE, label: 'Soporte Venezuela' },
  },
};

// Persistent department keyboard (always visible)
export const DEPARTMENT_KEYBOARD = new Keyboard()
  .text(BTN.CONSULTORIA).text(BTN.SOPORTE).row()
  .text(BTN.VENTAS).text(BTN.ADMINISTRACION)
  .resized()
  .persistent();

// Country selection keyboard
export const COUNTRY_KEYBOARD = new Keyboard()
  .text(BTN.MEXICO).text(BTN.VENEZUELA)
  .resized()
  .oneTime();

// All button labels for quick lookup
export const ALL_DEPT_BUTTONS = new Set<string>([BTN.CONSULTORIA, BTN.SOPORTE, BTN.VENTAS, BTN.ADMINISTRACION]);
export const ALL_COUNTRY_BUTTONS = new Set<string>([BTN.MEXICO, BTN.VENEZUELA]);

// Text representation for Chatwoot sync
export const MENU_TEXT =
  '💼 Consultoría | 🛠 Soporte | 🛒 Ventas | 📋 Administración';
