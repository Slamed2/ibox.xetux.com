import { InlineKeyboard } from 'grammy';

// Team IDs from Chatwoot
export const TEAMS = {
  SOPORTE_MX: 1,
  SOPORTE_VE: 2,
  CONSULTORIA_VE: 5,
  VENTAS: 6,
  ADMINISTRACION: 7,
  CONSULTORIA_MX: 8,
} as const;

// Department → team_id mapping for direct departments (no country selection needed)
export const DIRECT_DEPARTMENTS: Record<string, { teamId: number; label: string }> = {
  'dept:ventas': { teamId: TEAMS.VENTAS, label: 'Ventas' },
  'dept:administracion': { teamId: TEAMS.ADMINISTRACION, label: 'Administración' },
};

// Department + country → team_id mapping
export const COUNTRY_DEPARTMENTS: Record<string, Record<string, { teamId: number; label: string }>> = {
  'dept:consultoria': {
    'country:mx': { teamId: TEAMS.CONSULTORIA_MX, label: 'Consultoría México' },
    'country:ve': { teamId: TEAMS.CONSULTORIA_VE, label: 'Consultoría Venezuela' },
  },
  'dept:soporte': {
    'country:mx': { teamId: TEAMS.SOPORTE_MX, label: 'Soporte México' },
    'country:ve': { teamId: TEAMS.SOPORTE_VE, label: 'Soporte Venezuela' },
  },
};

// Reusable keyboard for department selection
export const DEPARTMENT_KEYBOARD = new InlineKeyboard()
  .text('💼 Consultoría', 'dept:consultoria').text('🛠 Soporte', 'dept:soporte').row()
  .text('🛒 Ventas', 'dept:ventas').text('📋 Administración', 'dept:administracion');

// Country selection keyboard (built dynamically with department prefix)
export function countryKeyboard(dept: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🇲🇽 México', `${dept}|country:mx`)
    .text('🇻🇪 Venezuela', `${dept}|country:ve`);
}

// Text representation of menu for Chatwoot sync
export const MENU_TEXT =
  '💼 Consultoría | 🛠 Soporte | 🛒 Ventas | 📋 Administración';

// Department display names
export const DEPT_NAMES: Record<string, string> = {
  'dept:consultoria': 'Consultoría',
  'dept:soporte': 'Soporte',
  'dept:ventas': 'Ventas',
  'dept:administracion': 'Administración',
};
