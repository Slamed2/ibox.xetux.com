// Chatwoot webhook event types
export type ChatwootEventType =
  | 'conversation_created'
  | 'conversation_status_changed'
  | 'conversation_updated'
  | 'message_created'
  | 'message_updated'
  | 'webwidget_triggered';

export interface ChatwootContact {
  id: number;
  name: string;
  email?: string;
  phone_number?: string;
  identifier?: string;
  custom_attributes: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
}

export interface ChatwootConversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  assignee_id?: number;
  team_id?: number;
  contact: ChatwootContact;
  labels: string[];
  custom_attributes: Record<string, unknown>;
  additional_attributes: Record<string, unknown>;
}

export interface ChatwootMessage {
  id: number;
  content: string;
  content_type: string;
  message_type: 'incoming' | 'outgoing' | 'activity' | 'template';
  created_at: number;
  conversation_id: number;
  sender?: {
    id: number;
    type: 'contact' | 'user' | 'agent_bot';
    name: string;
  };
  account: {
    id: number;
  };
}

export interface ChatwootWebhookPayload {
  event: ChatwootEventType;
  id?: number;
  account: { id: number };
  conversation?: ChatwootConversation;
  message?: ChatwootMessage;
  // For status change events
  status?: string;
  previous_status?: string;
  // For conversation_updated
  changed_attributes?: Array<{
    previous_value: unknown;
    current_value: unknown;
  }>;
}

// Chatwoot REST API types
export interface ChatwootSendMessagePayload {
  content: string;
  message_type?: 'outgoing' | 'incoming';
  private?: boolean;
  content_type?: string;
  content_attributes?: Record<string, unknown>;
  source_id?: string;
}

export interface ChatwootAssignPayload {
  assignee_id?: number | null;
  team_id?: number | null;
}

export interface ChatwootUpdateContactPayload {
  name?: string;
  email?: string;
  phone_number?: string;
  additional_attributes?: Record<string, unknown>;
  custom_attributes?: Record<string, unknown>;
}
