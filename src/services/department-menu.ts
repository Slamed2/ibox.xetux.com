import { InlineKeyboard } from 'grammy';

// ─── Feature flags ──────────────────────────────────────────────────────────
// Set to true to show Ventas and Administración in menus and commands
export const VENTAS_ADMIN_ENABLED = false;

// Team IDs from Chatwoot (Venezuela)
export const TEAMS = {
  SOPORTE_VE: 2,
  CONSULTORIA_VE: 5,
  VENTAS_VE: 10,
  ADMINISTRACION_VE: 12,
} as const;

// Team ID → Chatwoot label mapping
export const TEAM_LABELS: Record<number, string> = {
  [TEAMS.SOPORTE_VE]: 'soporte-venezuela',
  [TEAMS.CONSULTORIA_VE]: 'consultoria-venezuela',
  [TEAMS.VENTAS_VE]: 'ventas-venezuela',
  [TEAMS.ADMINISTRACION_VE]: 'administracion-venezuela',
};

// All department label values — used to remove old department labels before adding a new one
export const ALL_DEPARTMENT_LABELS = Object.values(TEAM_LABELS);

// Team names for display
export const TEAM_NAMES: Record<number, string> = {
  [TEAMS.SOPORTE_VE]: 'Soporte Venezuela',
  [TEAMS.CONSULTORIA_VE]: 'Consultoría Venezuela',
  [TEAMS.VENTAS_VE]: 'Ventas Venezuela',
  [TEAMS.ADMINISTRACION_VE]: 'Administración Venezuela',
};

// Bot commands (department shortcuts)
export const BOT_COMMANDS = [
  { command: 'consultoria', description: '💼 Chatear con Consultoría' },
  { command: 'soporte', description: '🛠 Chatear con Soporte' },
  ...(VENTAS_ADMIN_ENABLED
    ? [
        { command: 'ventas', description: '🛒 Chatear con Ventas' },
        { command: 'administracion', description: '📋 Chatear con Administración' },
      ]
    : []),
];

// Text representation for Chatwoot sync
export const MENU_TEXT = VENTAS_ADMIN_ENABLED
  ? '💼 /consultoria | 🛠 /soporte | 🛒 /ventas | 📋 /administracion'
  : '💼 /consultoria | 🛠 /soporte';

/**
 * Build the inline keyboard for department selection (Venezuela).
 * Respects VENTAS_ADMIN_ENABLED flag.
 */
export function buildDepartmentKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('💼 Consultoría', `team:${TEAMS.CONSULTORIA_VE}:Consultoría`)
    .text('🛠 Soporte', `team:${TEAMS.SOPORTE_VE}:Soporte`);
  if (VENTAS_ADMIN_ENABLED) {
    kb.row()
      .text('🛒 Ventas', `team:${TEAMS.VENTAS_VE}:Ventas`)
      .text('📋 Administración', `team:${TEAMS.ADMINISTRACION_VE}:Administración`);
  }
  return kb;
}

/** Text version of department menu for Chatwoot sync */
export const DEPARTMENT_MENU_CHATWOOT = VENTAS_ADMIN_ENABLED
  ? '¿Con qué departamento deseas comunicarte?\n\n💼 Consultoría | 🛠 Soporte | 🛒 Ventas | 📋 Administración'
  : '¿Con qué departamento deseas comunicarte?\n\n💼 Consultoría | 🛠 Soporte';

// Department command → Venezuela team
const COMMAND_TEAMS: Record<string, { teamId: number; label: string }> = {
  consultoria: { teamId: TEAMS.CONSULTORIA_VE, label: 'Consultoría Venezuela' },
  soporte: { teamId: TEAMS.SOPORTE_VE, label: 'Soporte Venezuela' },
  ...(VENTAS_ADMIN_ENABLED
    ? {
        ventas: { teamId: TEAMS.VENTAS_VE, label: 'Ventas Venezuela' },
        administracion: { teamId: TEAMS.ADMINISTRACION_VE, label: 'Administración Venezuela' },
      }
    : {}),
};

/**
 * Resolve a department command to its Venezuela team.
 * Returns null for unknown/disabled commands.
 */
export function resolveTeamFromCommand(command: string): { teamId: number; label: string } | null {
  return COMMAND_TEAMS[command] ?? null;
}
