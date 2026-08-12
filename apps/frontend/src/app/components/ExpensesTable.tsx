import { Table } from '@chakra-ui/react';
import { Expenditure } from '@/types';
import StatusBadge from './StatusBadge';

interface ExpensesTableProps {
  expenditures: Expenditure[];
  /** Project detail already scopes to one project, so it hides this column. */
  showProject?: boolean;
  projectNames?: Record<number, string>;
  onViewReceipt?: (expenditure: Expenditure) => void;
  onRowClick?: (expenditure: Expenditure) => void;
}

export default function ExpensesTable({
  expenditures,
  showProject = true,
  projectNames = {},
  onViewReceipt,
  onRowClick,
}: ExpensesTableProps) {
  const columnCount = showProject ? 7 : 6;

  return (
    <Table.Root>
      <Table.ColumnGroup>
        <Table.Column width={showProject ? '11.5%' : '14%'} />
        <Table.Column width={showProject ? '15.3%' : '19%'} />
        <Table.Column width={showProject ? '16.6%' : '21%'} />
        {showProject && <Table.Column width="21.8%" />}
        <Table.Column width={showProject ? '14%' : '18%'} />
        <Table.Column width={showProject ? '11%' : '14%'} />
        <Table.Column width={showProject ? '9.8%' : '14%'} />
      </Table.ColumnGroup>

      <Table.Header>
        <Table.Row backgroundColor="var(--color-primary-800)">
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Expense ID</h5></Table.ColumnHeader>
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Date</h5></Table.ColumnHeader>
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Type of Expense</h5></Table.ColumnHeader>
          {showProject && (
            <Table.ColumnHeader color="var(--color-core-white)"><h5>Project</h5></Table.ColumnHeader>
          )}
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Amount</h5></Table.ColumnHeader>
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Receipt</h5></Table.ColumnHeader>
          <Table.ColumnHeader color="var(--color-core-white)"><h5>Status</h5></Table.ColumnHeader>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {expenditures.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={columnCount} style={{ textAlign: 'center', padding: '2rem' }}>
              No expenditures found.
            </Table.Cell>
          </Table.Row>
        ) : (
          expenditures.map((e) => (
            <Table.Row
              key={e.expenditure_id}
              onClick={onRowClick ? () => onRowClick(e) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              <Table.Cell>#{String(e.expenditure_id).padStart(6, '0')}</Table.Cell>
              <Table.Cell>
                {new Date(e.spent_on).toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric',
                })}
              </Table.Cell>
              <Table.Cell>{e.category ?? '—'}</Table.Cell>
              {showProject && (
                <Table.Cell>{projectNames[e.project_id] ?? '---'}</Table.Cell>
              )}
              <Table.Cell>
                ${parseFloat(e.amount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Table.Cell>
              <Table.Cell>
                {e.receipt_url ? (
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
                )}
              </Table.Cell>
              <Table.Cell>
                <StatusBadge status={e.status} />
              </Table.Cell>
            </Table.Row>
          ))
        )}
      </Table.Body>
    </Table.Root>
  );
}
