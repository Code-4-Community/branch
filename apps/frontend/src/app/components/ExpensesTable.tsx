'use client';

import { Expenditure } from '@/types';
import DataTable, { type DataTableColumn } from './DataTable';
import StatusBadge from './StatusBadge';

interface ExpensesTableProps {
  expenditures: Expenditure[];
  /** Project detail already scopes to one project, so it hides this column. */
  showProject?: boolean;
  projectNames?: Record<number, string>;
  onViewReceipt?: (expenditure: Expenditure) => void;
  onRowClick?: (expenditure: Expenditure) => void;
  /** Fills the body with skeleton rows, keeping the header and widths in place. */
  isLoading?: boolean;
  /** Set this to the page size so the table does not resize when data lands. */
  skeletonRows?: number;
}

function formatAmount(amount: string) {
  return `$${parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ExpensesTable({
  expenditures,
  showProject = true,
  projectNames = {},
  onViewReceipt,
  onRowClick,
  isLoading = false,
  skeletonRows = 5,
}: ExpensesTableProps) {
  // Percentages are shared out among whichever columns are on, so dropping one
  // widens the rest instead of leaving a gap at the end of the row.
  const widths = showProject
    ? { id: '11.5%', date: '15.3%', type: '16.6%', project: '21.8%', amount: '14%', receipt: '11%', status: '9.8%' }
    : { id: '14%', date: '19%', type: '21%', project: '0', amount: '18%', receipt: '14%', status: '14%' };

  const columns: DataTableColumn<Expenditure>[] = [
    {
      key: 'id',
      header: 'Expense ID',
      width: widths.id,
      cell: (e) => `#${String(e.expenditure_id).padStart(6, '0')}`,
      skeleton: { width: '80%' },
    },
    {
      key: 'date',
      header: 'Date',
      width: widths.date,
      cell: (e) =>
        new Date(e.spent_on).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        }),
      skeleton: { width: '75%' },
    },
    {
      key: 'type',
      header: 'Type of Expense',
      width: widths.type,
      cell: (e) => e.category ?? '—',
    },
    ...(showProject
      ? [
          {
            key: 'project',
            header: 'Project',
            width: widths.project,
            cell: (e: Expenditure) => projectNames[e.project_id] ?? '---',
          },
        ]
      : []),
    {
      key: 'amount',
      header: 'Amount',
      width: widths.amount,
      cell: (e) => formatAmount(e.amount),
      skeleton: { width: '60%' },
    },
    {
      key: 'receipt',
      header: 'Receipt',
      width: widths.receipt,
      cell: (e) =>
        e.receipt_url ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewReceipt?.(e);
            }}
            style={{
              color: 'var(--color-primary-700)',
              textDecoration: 'underline',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
            }}
          >
            View Receipt
          </button>
        ) : (
          '---'
        ),
      skeleton: { width: '70%' },
    },
    {
      key: 'status',
      header: 'Status',
      width: widths.status,
      cell: (e) => <StatusBadge status={e.status} />,
      // Matches the pill the loaded row shows rather than a text bar.
      skeleton: { width: '81px', height: 29, className: '!rounded-[14px]' },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={expenditures}
      rowKey={(e) => e.expenditure_id}
      onRowClick={onRowClick}
      isLoading={isLoading}
      loadingLabel="Loading expenses…"
      skeletonRows={skeletonRows}
      emptyMessage="No expenditures found."
    />
  );
}
