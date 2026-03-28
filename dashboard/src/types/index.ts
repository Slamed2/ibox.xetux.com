export interface ExecutionLog {
  id: string;
  eventType: string;
  source: string;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'success' | 'error';
  inputData: unknown;
  outputData: unknown | null;
  errorMessage: string | null;
  durationMs: number | null;
  conversationId: string | null;
  contactId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogsResponse {
  data: ExecutionLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LogStats {
  totalLogs: number;
  byStatus: Record<string, number>;
  byEventType: Record<string, number>;
  avgDurationMs: number;
}

export interface LogFilters {
  eventType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
