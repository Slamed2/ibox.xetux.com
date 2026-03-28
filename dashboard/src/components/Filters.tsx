import type { LogFilters } from '../types/index.js';

interface FiltersProps {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
}

const EVENT_TYPES = [
  '',
  'chatwoot:conversation_created',
  'chatwoot:message_created',
  'chatwoot:conversation_resolved',
  'chatwoot:team_changed',
  'telegram:message',
];

const STATUSES = ['', 'pending', 'success', 'error'];

export function Filters({ filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Event Type</label>
        <select
          value={filters.eventType ?? ''}
          onChange={(e) => onChange({ ...filters, eventType: e.target.value || undefined, page: 1 })}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All events</option>
          {EVENT_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Status</label>
        <select
          value={filters.status ?? ''}
          onChange={(e) => onChange({ ...filters, status: e.target.value || undefined, page: 1 })}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">From</label>
        <input
          type="datetime-local"
          value={filters.dateFrom ?? ''}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined, page: 1 })}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">To</label>
        <input
          type="datetime-local"
          value={filters.dateTo ?? ''}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined, page: 1 })}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>

      <button
        onClick={() => onChange({ page: 1, limit: filters.limit })}
        className="border rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
      >
        Clear
      </button>
    </div>
  );
}
