import type { LogsResponse, LogStats, ExecutionLog, LogFilters } from '../types/index.js';

const BASE_URL = '/api';

export async function fetchLogs(filters: LogFilters): Promise<LogsResponse> {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.status) params.set('status', filters.status);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.search) params.set('search', filters.search);
  if (filters.conversationId) params.set('conversationId', filters.conversationId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`${BASE_URL}/logs?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
  return res.json();
}

export async function fetchLogById(id: string): Promise<ExecutionLog> {
  const res = await fetch(`${BASE_URL}/logs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch log: ${res.statusText}`);
  return res.json();
}

export async function fetchLogStats(): Promise<LogStats> {
  const res = await fetch(`${BASE_URL}/logs/stats`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  return res.json();
}
