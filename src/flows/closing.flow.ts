import { chatwootService } from '../services/chatwoot.service.js';
import { summarizeConversation } from '../services/ai.service.js';
import { withExecutionLog } from '../services/execution-log.service.js';
import { bot } from '../services/telegram.service.js';
import type { ChatwootWebhookPayload } from '../types/chatwoot.types.js';
import { logger } from '../utils/logger.js';

export async function handleConversationResolved(payload: ChatwootWebhookPayload) {
  const conversation = payload.conversation;
  if (!conversation) return;

  // Only act on resolution
  if (conversation.status !== 'resolved') return;

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
      const farewellMessage = `Su conversación #${conversation.id} ha sido procesada y solucionada. Estamos atentos a cualquier duda o caso pendiente que pueda tener para ser atendido por nuestro departamento.\n\nSu opinión es importante para nosotros, por esta razón nos gustaría que nos apoyara llenando esta breve encuesta https://forms.gle/8Tv3jKP5WTziFPqD8\n\nGracias por comunicarse con Xetux.`;

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

      // Generate AI summary of the conversation
      const messages = await chatwootService.getMessages(conversation.id);
      const summary = await summarizeConversation(messages);

      // Save summary as internal note
      await chatwootService.sendMessage(conversation.id, {
        content: `📋 **Informe IA**\n\n${summary}`,
        private: true,
        message_type: 'outgoing',
      });

      // Save summary in conversation custom_attributes
      await chatwootService.updateConversationCustomAttributes(conversation.id, {
        resumen_de_ia: summary,
      });

      logger.info({ conversationId: conversation.id }, 'Conversation closed with farewell and AI summary');
      return { farewell: 'sent', telegramMessageId, aiSummary: true };
    },
  );
}
