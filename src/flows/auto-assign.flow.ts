import { chatwootService } from '../services/chatwoot.service.js';
import { assignTeamSmart } from './routing.flow.js';
import { TEAMS } from '../services/department-menu.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Red de seguridad: asigna a Soporte VE las conversaciones que quedaron sin
 * rutear. Se dispara cuando una conversación está ABIERTA, SIN equipo Y SIN
 * agente, y tiene más de AUTO_ASSIGN_AGE_MINUTES desde su creación.
 *
 * `assignee_type=unassigned` ya garantiza que no tiene agente; aquí filtramos
 * además las que no tienen equipo, no son `interno`, y superan la antigüedad.
 */
export async function sweepUnassignedConversations(): Promise<void> {
  const inboxId = config.CHATWOOT_INBOX_ID;
  if (!inboxId) return;

  const ageMs = config.AUTO_ASSIGN_AGE_MINUTES * 60 * 1000;
  const now = Date.now();
  let assigned = 0;

  try {
    const convs = await chatwootService.listOpenUnassignedConversations(inboxId);

    for (const conv of convs) {
      const conversationId = conv?.id;
      if (!conversationId) continue;

      // Ya tiene equipo → no tocar
      const teamId = conv?.meta?.team?.id ?? conv?.team_id ?? null;
      if (teamId) continue;

      // Ya tiene agente (por si el filtro de la API no lo excluyó) → no tocar
      if (conv?.meta?.assignee?.id) continue;

      // Conversaciones internas → nunca automatizar
      const labels: unknown = conv?.labels ?? conv?.meta?.labels ?? [];
      if (Array.isArray(labels) && labels.includes('interno')) continue;

      // Antigüedad desde la creación (Chatwoot entrega created_at en epoch segundos)
      const createdAtSec = typeof conv?.created_at === 'number' ? conv.created_at : null;
      if (createdAtSec == null) continue;
      if (now - createdAtSec * 1000 < ageMs) continue;

      try {
        await assignTeamSmart(conversationId, TEAMS.SOPORTE_VE);
        assigned++;
        logger.info(
          { conversationId, ageMin: Math.round((now - createdAtSec * 1000) / 60000) },
          'Auto-assign: conversación sin rutear → Soporte VE',
        );
      } catch (err) {
        logger.error({ err, conversationId }, 'Auto-assign: falló la asignación a Soporte');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Auto-assign sweep failed');
  }

  if (assigned > 0) logger.info({ assigned }, 'Auto-assign sweep completado');
}
