/**
 * Horario de atención de Consultoría Venezuela.
 * Activo de 9:00 am a 6:00 pm (hora de Venezuela), todos los días.
 */
const VE_TIMEZONE = 'America/Caracas';
const OPEN_HOUR = 9; // 09:00 — primera hora activa
const CLOSE_HOUR = 18; // 18:00 — cerrado a partir de las 6:00 pm

/**
 * @returns true si el momento dado cae dentro del horario de Consultoría VE.
 * Granularidad por hora: activo en [09:00, 18:00) hora de Venezuela.
 */
export function isConsultoriaVeOpen(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: VE_TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}
