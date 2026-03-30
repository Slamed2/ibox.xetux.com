export interface CreateExecutionLog {
  eventType: string;
  source: string;
  direction: 'inbound' | 'outbound';
  inputData: unknown;
  conversationId?: string;
  contactId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionLogResult {
  id: string;
  status: 'success' | 'error';
  outputData?: unknown;
  errorMessage?: string;
  durationMs: number;
}

export interface LogFilters {
  eventType?: string;
  status?: string;
  direction?: string;
  chatType?: string;
  search?: string;
  conversationId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface LogStats {
  totalLogs: number;
  byStatus: Record<string, number>;
  byEventType: Record<string, number>;
  avgDurationMs: number;
}
