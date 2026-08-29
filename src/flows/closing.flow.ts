import { chatwootService } from '../services/chatwoot.service.js';
import { summarizeConversation } from '../services/ai.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import { TEAMS } from '../services/department-menu.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import {
  CONSULTORIA_VE_FAREWELL,
  FIRMA_CONSULTORIA_VE,
  sinRespuestaFarewell,
  sinCasoFarewell,
} from '../constants/messages.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * created_at (epoch segundos) del último mensaje ENTRANTE, o null si no hay.
 * La API devuelve message_type numérico (0 = incoming) y el webhook lo manda
 * como cadena, así que aceptamos las dos formas.
 */
function ultimoMensajeEntranteTs(messages: unknown[]): number | null {
  let ts: number | null = null;
  for (const m of messages as Array<Record<string, unknown>>) {
    const tipo = m?.message_type;
    if (tipo !== 0 && tipo !== 'incoming') continue;
    const c = Number(m?.created_at);
    if (Number.isFinite(c) && (ts === null || c > ts)) ts = c;
  }
  return ts;
}

const CIERRE_SIN_MENSAJE = ['interno', 'cierre-interno'];

/**
 * Elige la despedida según el motivo que el agente declaró al cerrar.
 * Sin etiqueta de motivo se comporta como siempre: despedida de "resuelto".
 */
type Conversacion = NonNullable<ChatwootWebhookPayload['conversation']>;

function elegirDespedida(conversation: Conversacion, labels: string[]): string {
  const isConsultoriaVE = Number(conversation.team_id) === TEAMS.CONSULTORIA_VE;
  const firma = isConsultoriaVE
    ? FIRMA_CONSULTORIA_VE
    : `¡Gracias por confiar en ${config.COMPANY_NAME}! ✨`;

  if (labels.includes('cierre-sin-caso')) return sinCasoFarewell(firma);
  if (labels.includes('sin-respuesta')) return sinRespuestaFarewell(config.SURVEY_FORM_URL, firma);
  if (isConsultoriaVE) return CONSULTORIA_VE_FAREWELL;
  return `👋 ¡Tu requerimiento (Ticket #${conversation.id}) ha sido resuelto con éxito!\nNos encantaría conocer tu experiencia para seguir mejorando: ${config.SURVEY_FORM_URL} ¡Gracias por confiar en ${config.COMPANY_NAME}! ✨`;
}

export async function handleConversationResolved(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Only act on resolution
  if (conversation.status !== 'resolved') return;

  // Cierres que no llevan ningún mensaje al cliente. "cierre-interno" la pone
  // el formulario de la extensión; no reutilizamos "interno" a secas porque esa
  // ya tiene una automatización propia colgando en n8n (regla 4 → webhook).
  const labels = conversation.labels ?? [];
  if (labels.some((l) => CIERRE_SIN_MENSAJE.includes(l))) return;

  await withExecutionLog(
    {
      eventType: 'chatwoot:conversation_resolved',
      source: 'chatwoot_webhook',
      direction: 'inbound',
      inputData: payload,
      conversationId: String(conversation.id),
      contactId: String(conversation.contact?.id),
    },
    async () => {
      // Traemos los mensajes ANTES de despedir: hacen falta para el resumen y
      // también para decidir si toca despedirse. Reabrir y volver a cerrar sin
      // que el cliente haya dicho nada no debe mandarle una segunda despedida
      // (pasó el 29-ago-2026 en la conversación 31993: dos en 13 segundos).
      // Pero si el cliente sí volvió a escribir, la conversación es nueva y su
      // cierre sí merece despedida.
      const messages = await chatwootService.getMessages(conversation.id, 15);

      const despedidaPrevia = conversation.custom_attributes?.despedida_enviada_at;
      const despedidaPreviaTs =
        typeof despedidaPrevia === 'string' ? Math.floor(Date.parse(despedidaPrevia) / 1000) : NaN;
      const entranteTs = ultimoMensajeEntranteTs(messages);

      if (Number.isFinite(despedidaPreviaTs) && (entranteTs === null || entranteTs <= despedidaPreviaTs)) {
        logger.info(
          { conversationId: conversation.id, despedidaPrevia, entranteTs },
          'Closing: ya se despidió y el cliente no ha escrito desde entonces — se omite',
        );
        return { farewell: 'skipped_duplicate', aiSummary: false };
      }

      const farewellMessage = elegirDespedida(conversation, labels);
      logger.info(
        { conversationId: conversation.id, teamId: conversation.team_id, labels },
        'Closing: motivo de cierre',
      );

      // Send farewell via Telegram
      const telegramUserId = conversation.contact?.additional_attributes?.social_telegram_user_id as number | undefined;
      let telegramMessageId: number | undefined;

      if (telegramUserId) {
        const sentMsg = await bot.api.sendMessage(telegramUserId, farewellMessage);
        telegramMessageId = sentMsg.message_id;
      }

      // Sync to Chatwoot
      await chatwootService.sendMessage(conversation.id, {
        content: farewellMessage,
        message_type: 'outgoing',
        ...(telegramMessageId ? { source_id: String(telegramMessageId) } : {}),
      });

      // Resumen IA sobre los mensajes ya traídos arriba (acotados a ~300 para no
      // escanear el historial completo de conversaciones enormes).
      const summary = await summarizeConversation(messages);

      // Save summary: internal note + custom attrs (parallel — independent of each other)
      await Promise.all([
        chatwootService.sendMessage(conversation.id, {
          content: `📋 **Informe IA**\n\n${summary}`,
          private: true,
          message_type: 'outgoing',
        }),
        chatwootService.updateConversationCustomAttributes(conversation.id, {
          ...(conversation.custom_attributes ?? {}),
          resumen_de_ia: summary,
          despedida_enviada_at: new Date().toISOString(),
        }),
      ]);

      logger.info({ conversationId: conversation.id }, 'Conversation closed with farewell and AI summary');
      return { farewell: 'sent', telegramMessageId, aiSummary: true };
    },
  );
}
