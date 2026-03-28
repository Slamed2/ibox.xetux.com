import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import type { ExecutionLog } from '../types/index.js';
import { StatusBadge } from './StatusBadge.js';

interface LogDetailProps {
  log: ExecutionLog;
  onClose: () => void;
}

export function LogDetail({ log, onClose }: LogDetailProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Execution Detail</h2>
            <StatusBadge status={log.status} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">Event Type</span>
              <span className="font-mono">{log.eventType}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Source</span>
              <span className="font-mono">{log.source}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Direction</span>
              <span className="font-mono">{log.direction}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Duration</span>
              <span className="font-mono">{log.durationMs != null ? `${log.durationMs}ms` : '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Conversation ID</span>
              <span className="font-mono">{log.conversationId ?? '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Contact ID</span>
              <span className="font-mono">{log.contactId ?? '-'}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Created At</span>
              <span className="font-mono">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500 block">ID</span>
              <span className="font-mono text-xs">{log.id}</span>
            </div>
          </div>

          {log.errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <span className="text-red-700 font-medium block mb-1">Error</span>
              <pre className="text-red-600 text-sm whitespace-pre-wrap">{log.errorMessage}</pre>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Input Data</h3>
            <div className="bg-gray-50 rounded p-3 overflow-x-auto">
              <JsonView data={log.inputData as object} style={defaultStyles} />
            </div>
          </div>

          {log.outputData != null && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Output Data</h3>
              <div className="bg-gray-50 rounded p-3 overflow-x-auto">
                <JsonView data={log.outputData as object} style={defaultStyles} />
              </div>
            </div>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Metadata</h3>
              <div className="bg-gray-50 rounded p-3 overflow-x-auto">
                <JsonView data={log.metadata as object} style={defaultStyles} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
