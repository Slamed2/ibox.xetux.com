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
}

export const chatwootService = new ChatwootService();
