import { chatwootService } from './chatwoot.service.js';
import { withExecutionLog } from './execution-log.service.js';
import { markBotAssignment } from './telegram.service.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ─── Parámetros (constantes; no configurables por env) ──────────────────────
export const AUTO_ASSIGN_ENABLED = true;
export const AUTO_ASSIGN_SWEEP_INTERVAL_MINUTES = 2;
const AUTO_ASSIGN_TIMEOUT_MINUTES = 5;
const AUTO_ASSIGN_FALLBACK_TEAM_ID = 2; // Soporte Venezuela
const AUTO_ASSIGN_MAX_PER_SWEEP = 10; // tope por barrido: evita ráfagas (drena backlog gradual)

/**
 * Red de seguridad: asigna a un equipo de respaldo (Soporte VE por defecto) las
 * conversaciones que quedaron "en el limbo" — para que nadie quede sin atender
 * aunque no complete el registro ni elija departamento.
 *
 * Filtros (una conversación califica si cumple TODOS):
 *   1. estado open
 *   2. team_id vacío (sin departamento)
 *   3. sin etiqueta `interno`
 *   4. creada hace > AUTO_ASSIGN_TIMEOUT_MINUTES
 *   5. inbox = CHATWOOT_INBOX_ID (canal de Telegram, configurado por env)
 *
 * Diseño liviano (bajo RAM/CPU):
 * - Pide al endpoint de filtro SOLO las open team-less del inbox → escala con el
 *   limbo, no con el volumen total. (1, 2 y 5 se aplican en la API; 3 y 4 en código.)
 * - Sin estado en memoria: "sin equipo" es idempotente — al asignar, deja de calificar.
 * - Tope de AUTO_ASSIGN_MAX_PER_SWEEP por barrido: drena el backlog gradualmente.
 * - Silencioso para el cliente: solo asigna equipo + nota privada para los agentes.
 */
export async function sweepUnattendedConversations(): Promise<void> {
  const inboxId = config.CHATWOOT_INBOX_ID;
  const cutoffMs = Date.now() - AUTO_ASSIGN_TIMEOUT_MINUTES * 60_000;

  let convs: any[];
  try {
    convs = await chatwootService.listOpenTeamlessConversations(inboxId);
  } catch (err) {
    logger.error({ err, inboxId }, 'Auto-assign sweep: failed to list conversations');
    return;
  }

  let assigned = 0;
  let capped = false;
  for (const conv of convs) {
    const labels: string[] = conv.labels ?? [];
    const createdAtMs = (conv.created_at ?? 0) * 1000;

    // (open + sin equipo + inbox ya garantizados por la consulta)
    if (conv.meta?.team?.id) continue; // defensivo: nunca tocar una con equipo
    if (labels.includes('interno')) continue; // etiqueta interno → conversación interna
    if (createdAtMs > cutoffMs) continue; // creada hace < 5 min → aún se le da tiempo

    // Tope por barrido: drena el backlog en varios barridos en vez de una ráfaga,
    // suaviza la carga API y acota la ventana de markBotAssignment (10s). El resto
    // sigue siendo team-less, así que el próximo barrido lo recoge.
    if (assigned >= AUTO_ASSIGN_MAX_PER_SWEEP) { capped = true; break; }

    try {
      await assignFallbackTeam(conv);
      assigned++;
    } catch (err) {
      logger.error({ err, conversationId: conv.id }, 'Auto-assign sweep: failed to assign conversation');
    }
  }

  if (assigned > 0) {
    logger.info(
      { assigned, scanned: convs.length, inboxId, capped },
      capped
        ? 'Auto-assign sweep: assigned (capped — el resto se procesa en el próximo barrido)'
        : 'Auto-assign sweep: assigned unattended conversations to fallback team',
    );
  }
}

async function assignFallbackTeam(conv: any): Promise<void> {
  const conversationId = conv.id as number;
  const teamId = AUTO_ASSIGN_FALLBACK_TEAM_ID;
  const contactId = conv.meta?.sender?.id;
  const registered = !!conv.meta?.sender?.custom_attributes?.xetux_id;
  const ageMin = Math.round((Date.now() - (conv.created_at ?? 0) * 1000) / 60_000);

  await withExecutionLog(
    {
      eventType: 'flow:auto_assign',
      source: 'scheduler',
      direction: 'outbound',
      inputData: { conversationId, ageMinutes: ageMin, registered },
      conversationId: String(conversationId),
      contactId: contactId != null ? String(contactId) : undefined,
      metadata: { teamId, reason: registered ? 'no_department' : 'no_registration' },
    },
    async () => {
      // Marcar como asignación del bot ANTES de asignar: suprime el mensaje que
      // assignment.flow (handleTeamChange) enviaría al cliente al cambiar de equipo.
      markBotAssignment(conversationId);

      // Asignar equipo de respaldo
      await chatwootService.assignConversation(conversationId, { team_id: teamId });

      // Nota privada para los agentes (no visible para el cliente)
      const motivo = registered ? 'no seleccionó departamento' : 'no completó el registro';
      await chatwootService.sendMessage(conversationId, {
        content: `🤖 Asignada automáticamente tras ${ageMin} min: el usuario ${motivo}. Atender manualmente.`,
        message_type: 'outgoing',
        private: true,
      });

      logger.info({ conversationId, teamId, ageMin, registered }, 'Auto-assigned unattended conversation');
      return { action: 'auto_assigned', conversationId, teamId, registered };
    },
  );
}
