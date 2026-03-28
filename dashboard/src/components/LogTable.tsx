import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import type { ExecutionLog } from '../types/index.js';
import { StatusBadge } from './StatusBadge.js';

const columnHelper = createColumnHelper<ExecutionLog>();

const columns = [
  columnHelper.accessor('created_at', {
    header: 'Time',
    cell: (info) => format(new Date(info.getValue()), 'dd/MM HH:mm:ss'),
  }),
  columnHelper.accessor('event_type', {
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
  columnHelper.accessor('duration_ms', {
    header: 'Duration',
    cell: (info) => {
      const val = info.getValue();
      return val != null ? `${val}ms` : '-';
    },
  }),
  columnHelper.accessor('conversation_id', {
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
}

export function LogTable({ data, onRowClick, page, totalPages, total, onPageChange }: LogTableProps) {
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
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row.original)}
                  className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
