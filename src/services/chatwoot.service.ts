import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Reusable keep-alive agents — avoids TCP+TLS handshake per request
export const keepAliveHttpAgent = new HttpAgent({ keepAlive: true, maxSockets: config.HTTP_AGENT_MAX_SOCKETS });
export const keepAliveHttpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: config.HTTP_AGENT_MAX_SOCKETS });
import type {
  ChatwootSendMessagePayload,
  ChatwootAssignPayload,
  ChatwootUpdateContactPayload,
} from '../types/chatwoot.types.js';

const RETRIABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ERR_NETWORK']);

class ChatwootService {
  private client: AxiosInstance;
  private accountId: number;
  private labelLocks = new Map<number, Promise<void>>();

  /**
   * Serialize label operations per conversation to prevent race conditions.
   * Two concurrent read-modify-write cycles on the same conversation's labels
   * would overwrite each other; this ensures they run sequentially.
   */
  private async withLabelLock<T>(conversationId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.labelLocks.get(conversationId) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>(r => { resolve = r; });
    this.labelLocks.set(conversationId, next);
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
      if (this.labelLocks.get(conversationId) === next) {
        this.labelLocks.delete(conversationId);
      }
    }
  }

  constructor() {
    this.accountId = config.CHATWOOT_ACCOUNT_ID;
    this.client = axios.create({
      baseURL: `${config.CHATWOOT_BASE_URL}/api/v1/accounts/${this.accountId}`,
      timeout: config.CHATWOOT_API_TIMEOUT_MS,
      httpAgent: keepAliveHttpAgent,
      httpsAgent: keepAliveHttpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': config.CHATWOOT_API_TOKEN,
      },
    });

    // Retry interceptor with exponential backoff
    this.client.interceptors.response.use(undefined, async (error: AxiosError) => {
      const cfg = error.config as InternalAxiosRequestConfig & { __retryCount?: number };
      if (!cfg) throw error;

      const retryCount = cfg.__retryCount ?? 0;
      const status = error.response?.status;
      const isRetriable = RETRIABLE_CODES.has(error.code ?? '') || status === 429 || (status !== undefined && status >= 500);

      if (!isRetriable || retryCount >= config.CHATWOOT_API_RETRIES) {
        logger.error({
          method: cfg.method, url: cfg.url, status, code: error.code,
          attempt: retryCount + 1, msg: error.message,
        }, 'Chatwoot API request failed (no more retries)');
        throw error;
      }

      cfg.__retryCount = retryCount + 1;

      // Respect Retry-After header on 429
      const retryAfter = error.response?.headers?.['retry-after'];
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : 300 * Math.pow(3, retryCount); // 300ms, 900ms, 2700ms

      logger.warn({
        method: cfg.method, url: cfg.url, status, code: error.code,
        attempt: retryCount + 1, delayMs,
      }, 'Chatwoot API request failed, retrying');

      await new Promise(resolve => setTimeout(resolve, delayMs));
      return this.client(cfg);
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

  async deleteMessage(conversationId: number, messageId: number) {
    logger.debug({ conversationId, messageId }, 'Deleting message in Chatwoot');
    await this.client.delete(`/conversations/${conversationId}/messages/${messageId}`);
  }

  async updateMessage(conversationId: number, messageId: number, content: string) {
    logger.debug({ conversationId, messageId }, 'Updating message in Chatwoot');
    const { data } = await this.client.patch(
      `/conversations/${conversationId}/messages/${messageId}`,
      { content },
    );
    return data;
  }

  async findMessageBySourceId(conversationId: number, sourceId: string) {
    const messages = await this.getMessages(conversationId);
    return messages.find((m: any) => String(m.source_id) === sourceId) ?? null;
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
    return this.withLabelLock(conversationId, async () => {
      logger.debug({ conversationId, labels }, 'Adding labels');
      const conversation = await this.getConversation(conversationId);
      const currentLabels = conversation.labels ?? [];
      const mergedLabels = [...new Set([...currentLabels, ...labels])];

      const { data } = await this.client.post(
        `/conversations/${conversationId}/labels`,
        { labels: mergedLabels },
      );
      return data;
    });
  }

  async removeLabels(conversationId: number, labelsToRemove: string[]) {
    return this.withLabelLock(conversationId, async () => {
      const conversation = await this.getConversation(conversationId);
      const currentLabels: string[] = conversation.labels ?? [];
      const filteredLabels = currentLabels.filter(l => !labelsToRemove.includes(l));

      const { data } = await this.client.post(
        `/conversations/${conversationId}/labels`,
        { labels: filteredLabels },
      );
      return data;
    });
  }

  /**
   * Atomically replace department labels: remove all old department labels and add the new one
   * in a single API call. Serialized per-conversation via withLabelLock to prevent race conditions.
   */
  async replaceDepartmentLabel(conversationId: number, newLabel: string, allDepartmentLabels: string[]) {
    return this.withLabelLock(conversationId, async () => {
      const conversation = await this.getConversation(conversationId);
      const currentLabels: string[] = conversation.labels ?? [];
      const filtered = currentLabels.filter(l => !allDepartmentLabels.includes(l));
      filtered.push(newLabel);
      const uniqueLabels = [...new Set(filtered)];

      logger.debug({ conversationId, newLabel, before: currentLabels, after: uniqueLabels }, 'Replacing department label');
      const { data } = await this.client.post(
        `/conversations/${conversationId}/labels`,
        { labels: uniqueLabels },
      );
      return data;
    });
  }

  async getConversation(conversationId: number) {
    const { data } = await this.client.get(`/conversations/${conversationId}`);
    return data;
  }

  async getMessages(conversationId: number) {
    const messages: any[] = [];
    let before: number | undefined;

    // Paginate through all messages
    while (true) {
      const params: Record<string, unknown> = {};
      if (before) params.before = before;

      const { data } = await this.client.get(`/conversations/${conversationId}/messages`, { params });
      const payload = data.payload ?? [];
      if (payload.length === 0) break;

      messages.push(...payload);
      before = payload[payload.length - 1]?.id;
      if (payload.length < 20) break; // Less than a full page means we're done
    }

    return messages;
  }

  async updateConversationCustomAttributes(conversationId: number, customAttributes: Record<string, unknown>) {
    const { data } = await this.client.patch(`/conversations/${conversationId}`, {
      custom_attributes: customAttributes,
    });
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
