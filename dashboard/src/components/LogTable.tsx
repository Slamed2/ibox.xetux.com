import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { ExecutionLog } from '../types/index.js';
import { StatusBadge } from './StatusBadge.js';

const TZ = 'America/Caracas'; // UTC-4

const columnHelper = createColumnHelper<ExecutionLog>();

const columns = [
  columnHelper.accessor('createdAt', {
    header: 'Time',
    cell: (info) => format(toZonedTime(new Date(info.getValue()), TZ), 'dd/MM HH:mm:ss'),
  }),
  columnHelper.accessor('eventType', {
    header: 'Event',
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('direction', {
    header: 'Dir',
    cell: (info) => (
      <span className={`text-xs ${info.getValue() === 'inbound' ? 'text-blue-600' : 'text-orange-600'}`}>
        {info.getValue() === 'inbound' ? '\u2193 IN' : '\u2191 OUT'}
      </span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue() as 'pending' | 'success' | 'error'} />,
  }),
  columnHelper.accessor('durationMs', {
    header: 'Duration',
    cell: (info) => {
      const val = info.getValue();
      return val != null ? `${val}ms` : '-';
    },
  }),
  columnHelper.accessor('conversationId', {
    header: 'Conv. ID',
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue() ?? '-'}</span>
    ),
  }),
];

interface LogTableProps {
  data: ExecutionLog[];
  onRowClick: (log: ExecutionLog) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  markTimestamp?: string | null;
}

export function LogTable({ data, onRowClick, page, totalPages, total, onPageChange, markTimestamp }: LogTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-gray-50">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-400">
                  No execution logs found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, idx) => {
                // Show separator line between rows that straddle the mark timestamp
                // Logs are sorted newest-first, so mark goes AFTER the last row newer than markTimestamp
                let showMark = false;
                if (markTimestamp) {
                  const thisTime = new Date(row.original.createdAt).getTime();
                  const markTime = new Date(markTimestamp).getTime();
                  if (thisTime < markTime) {
                    // This row is older than the mark — check if previous row was newer
                    const prevRow = table.getRowModel().rows[idx - 1];
                    if (!prevRow || new Date(prevRow.original.createdAt).getTime() >= markTime) {
                      showMark = true;
                    }
                  }
                }

                return (
                  <>
                    {showMark && (
                      <tr key={`mark-${row.id}`}>
                        <td colSpan={columns.length} className="px-0 py-0">
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 border-t-2 border-dashed border-yellow-400" />
                            <span className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wider whitespace-nowrap">
                              ✂ Marca — {format(toZonedTime(new Date(markTimestamp!), TZ), 'dd/MM HH:mm:ss')}
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-yellow-400" />
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      key={row.id}
                      onClick={() => onRowClick(row.original)}
                      className={`border-b hover:bg-blue-50 cursor-pointer transition-colors${
                        markTimestamp && new Date(row.original.createdAt).getTime() >= new Date(markTimestamp).getTime()
                          ? ' bg-yellow-50/40'
                          : ''
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-3 py-3 border-t text-sm text-gray-600">
        <span>{total} total executions</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100"
          >
            Prev
          </button>
          <span>Page {page} of {totalPages || 1}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-100"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
