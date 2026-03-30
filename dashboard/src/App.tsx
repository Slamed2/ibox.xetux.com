import { useState } from 'react';
import { useExecutionLogs, useLogStats } from './hooks/useExecutionLogs.js';
import { LogTable } from './components/LogTable.js';
import { LogDetail } from './components/LogDetail.js';
import { Filters } from './components/Filters.js';
import type { ExecutionLog, LogFilters } from './types/index.js';

export default function App() {
  const [filters, setFilters] = useState<LogFilters>({ page: 1, limit: 50 });
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);
  const [markTimestamp, setMarkTimestamp] = useState<string | null>(null);

  const { data: logsData, isLoading, error } = useExecutionLogs(filters);
  const { data: stats } = useLogStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">iBox Dashboard</h1>
            <p className="text-sm text-gray-500">Execution logs &amp; monitoring</p>
          </div>
          {stats && (
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.totalLogs}</div>
                <div className="text-gray-500">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.byStatus.success ?? 0}</div>
                <div className="text-gray-500">Success</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.byStatus.error ?? 0}</div>
                <div className="text-gray-500">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-700">{Math.round(stats.avgDurationMs)}ms</div>
                <div className="text-gray-500">Avg Duration</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-between">
            <Filters filters={filters} onChange={setFilters} />
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button
                onClick={() => setMarkTimestamp(new Date().toISOString())}
                className="px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded hover:bg-yellow-600 transition-colors"
                title="Marcar este momento — los logs nuevos aparecerán después de la línea"
              >
                ✂ Marcar
              </button>
              {markTimestamp && (
                <button
                  onClick={() => setMarkTimestamp(null)}
                  className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-sm"
                  title="Quitar marca"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500">
              Error loading logs: {error.message}
            </div>
          ) : logsData ? (
            <LogTable
              data={logsData.data}
              onRowClick={setSelectedLog}
              page={logsData.page}
              totalPages={logsData.totalPages}
              total={logsData.total}
              onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
              markTimestamp={markTimestamp}
            />
          ) : null}
        </div>
      </main>

      {/* Detail modal */}
      {selectedLog && (
        <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}
