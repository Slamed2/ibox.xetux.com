import type { LogFilters } from '../types/index.js';

interface FiltersProps {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
}

const EVENT_TYPES = [
  '',
  'chatwoot:conversation_created',
  'chatwoot:conversation_updated',
  'chatwoot:conversation_resolved',
  'chatwoot:conversation_status_changed',
  'chatwoot:message_created',
  'chatwoot:message_updated',
  'chatwoot:contact_updated',
  'telegram:command_start',
  'telegram:command_registro',
  'telegram:callback_query',
  'telegram:edited_message',
  'flow:greeting',
  'flow:closing',
  'flow:assignment',
  'flow:message_update',
  'webapp:register',
];

const STATUSES = ['', 'pending', 'success', 'error'];
const DIRECTIONS = ['', 'inbound', 'outbound'];

export function Filters({ filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Search</label>
        <input
          type="text"
          value={filters.search ?? ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined, page: 1 })}
          placeholder="XETUXID, team:7, etc."
          className="border rounded px-3 py-1.5 text-sm w-48"
        />
      </div>

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
        <label className="block text-xs text-gray-500 mb-1">Direction</label>
        <select
          value={filters.direction ?? ''}
          onChange={(e) => onChange({ ...filters, direction: e.target.value || undefined, page: 1 })}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All</option>
          {DIRECTIONS.filter(Boolean).map((d) => (
            <option key={d} value={d}>{d === 'inbound' ? '↓ Inbound' : '↑ Outbound'}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Conv. ID</label>
        <input
          type="text"
          value={filters.conversationId ?? ''}
          onChange={(e) => onChange({ ...filters, conversationId: e.target.value || undefined, page: 1 })}
          placeholder="6363"
          className="border rounded px-3 py-1.5 text-sm w-20"
        />
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
