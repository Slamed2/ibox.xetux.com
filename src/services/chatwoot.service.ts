import axios, { type AxiosInstance } from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type {
  ChatwootSendMessagePayload,
  ChatwootAssignPayload,
  ChatwootUpdateContactPayload,
} from '../types/chatwoot.types.js';

class ChatwootService {
  private client: AxiosInstance;
  private accountId: number;

  constructor() {
    this.accountId = config.CHATWOOT_ACCOUNT_ID;
    this.client = axios.create({
      baseURL: `${config.CHATWOOT_BASE_URL}/api/v1/accounts/${this.accountId}`,
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': config.CHATWOOT_API_TOKEN,
      },
    });
  }

  async sendMessage(conversationId: number, payload: ChatwootSendMessagePayload) {
    logger.debug({ conversationId, content: payload.content }, 'Sending message to Chatwoot');
    const { data } = await this.client.post(
      `/conversations/${conversationId}/messages`,
      payload,
    );
    return data;
  }

  async assignConversation(conversationId: number, payload: ChatwootAssignPayload) {
    logger.debug({ conversationId, ...payload }, 'Assigning conversation');
    const { data } = await this.client.post(
      `/conversations/${conversationId}/assignments`,
      payload,
    );
    return data;
  }

  async addLabels(conversationId: number, labels: string[]) {
    logger.debug({ conversationId, labels }, 'Adding labels');
    // Chatwoot replaces all labels, so we need to get current ones first
    const conversation = await this.getConversation(conversationId);
    const currentLabels = conversation.labels ?? [];
    const mergedLabels = [...new Set([...currentLabels, ...labels])];

    const { data } = await this.client.post(
      `/conversations/${conversationId}/labels`,
      { labels: mergedLabels },
    );
    return data;
  }

  async removeLabels(conversationId: number, labelsToRemove: string[]) {
    const conversation = await this.getConversation(conversationId);
    const currentLabels: string[] = conversation.labels ?? [];
    const filteredLabels = currentLabels.filter(l => !labelsToRemove.includes(l));

    const { data } = await this.client.post(
      `/conversations/${conversationId}/labels`,
      { labels: filteredLabels },
    );
    return data;
  }

  async getConversation(conversationId: number) {
    const { data } = await this.client.get(`/conversations/${conversationId}`);
    return data;
  }

  async getAgent(agentId: number) {
    try {
      const { data } = await this.client.get('/agents');
      const agents = Array.isArray(data) ? data : data.payload ?? [];
      return agents.find((a: any) => a.id === agentId) ?? null;
    } catch {
      logger.warn({ agentId }, 'Could not fetch agent info');
      return null;
    }
  }

  async updateContact(contactId: number, payload: ChatwootUpdateContactPayload) {
    logger.debug({ contactId, ...payload }, 'Updating contact');
    const { data } = await this.client.put(`/contacts/${contactId}`, payload);
    return data;
  }

  async toggleConversationStatus(conversationId: number, status: 'open' | 'resolved' | 'pending') {
    const { data } = await this.client.post(
      `/conversations/${conversationId}/toggle_status`,
      { status },
    );
    return data;
  }

  /**
   * Find a Chatwoot conversation by Telegram user ID.
   * Searches open conversations matching social_telegram_user_id in sender attributes.
   */
  async findConversationByTelegramUserId(telegramUserId: number): Promise<number | null> {
    try {
      // Search open conversations (page by page if needed)
      for (let page = 1; page <= 5; page++) {
        const { data } = await this.client.get('/conversations', {
          params: { status: 'open', page },
        });

        const conversations = data?.data?.payload ?? [];
        if (conversations.length === 0) break;

        for (const conv of conversations) {
          const senderTgId = conv?.meta?.sender?.additional_attributes?.social_telegram_user_id;
          if (senderTgId === telegramUserId) {
            return conv.id;
          }
        }
      }

      // Also check pending conversations
      const { data: pendingData } = await this.client.get('/conversations', {
        params: { status: 'pending', page: 1 },
      });
      const pendingConvs = pendingData?.data?.payload ?? [];
      for (const conv of pendingConvs) {
        const senderTgId = conv?.meta?.sender?.additional_attributes?.social_telegram_user_id;
        if (senderTgId === telegramUserId) {
          return conv.id;
        }
      }

      return null;
    } catch (err) {
      logger.error({ err, telegramUserId }, 'Failed to find conversation by Telegram user ID');
      return null;
    }
  }

  /**
   * Send a bot reply to Chatwoot, finding the conversation by Telegram user ID.
   * Includes the Telegram message_id as source_id so Chatwoot doesn't re-send it.
   */
  async sendMessageByTelegramUserId(
    telegramUserId: number,
    content: string,
    telegramMessageId?: number,
  ): Promise<boolean> {
    const conversationId = await this.findConversationByTelegramUserId(telegramUserId);
    if (!conversationId) {
      logger.warn({ telegramUserId }, 'No Chatwoot conversation found for Telegram user');
      return false;
    }

    const payload: ChatwootSendMessagePayload = {
      content,
      message_type: 'outgoing',
    };

    // Include source_id so Chatwoot knows this message was already sent via Telegram
    if (telegramMessageId) {
      payload.content_attributes = {
        external_created_at: new Date().toISOString(),
        in_reply_to_external_id: null,
      };
      payload.source_id = String(telegramMessageId);
    }

    await this.sendMessage(conversationId, payload);
    logger.info({ telegramUserId, conversationId, telegramMessageId }, 'Bot reply synced to Chatwoot');
    return true;
  }
}

export const chatwootService = new ChatwootService();
