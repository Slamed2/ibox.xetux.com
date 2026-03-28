import { useQuery } from '@tanstack/react-query';
import { fetchLogs, fetchLogStats } from '../api/client.js';
import type { LogFilters } from '../types/index.js';

export function useExecutionLogs(filters: LogFilters) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => fetchLogs(filters),
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: ['logStats'],
    queryFn: fetchLogStats,
  });
}
