import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLogs, fetchLogStats, cleanupByStatus, cleanupOldLogs } from '../api/client.js';
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

export function useCleanup() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['logs'] });
    queryClient.invalidateQueries({ queryKey: ['logStats'] });
  };

  return {
    cleanupStatus: async (status: string) => {
      const result = await cleanupByStatus(status);
      invalidate();
      return result;
    },
    cleanupOld: async () => {
      const result = await cleanupOldLogs();
      invalidate();
      return result;
    },
  };
}
