export interface ExecutionLog {
  id: string;
  event_type: string;
  source: string;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'success' | 'error';
  input_data: unknown;
  output_data: unknown | null;
  error_message: string | null;
  duration_ms: number | null;
  conversation_id: string | null;
  contact_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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
