import {
    Table,
  } from '@chakra-ui/react';
import { Expenditure } from '@/types';
  
  interface ExpensesTableProps {
    expenditures: Expenditure[];
    showDescription?: boolean;
  }
  
  export default function ExpensesTable({
    expenditures,
    showDescription = true,
  }: ExpensesTableProps) {
    return (
      <Table.Root>
        <Table.ColumnGroup>
          <Table.Column width={showDescription ? '12%' : '18%'} />
          <Table.Column width={showDescription ? '15%' : '20%'} />
          {showDescription && <Table.Column width="28%" />}
          <Table.Column width={showDescription ? '27%' : '42%'} />
          <Table.Column width={showDescription ? '16%' : '20%'} />
        </Table.ColumnGroup>
  
        <Table.Header>
          <Table.Row backgroundColor="var(--color-primary-800)">
            <Table.ColumnHeader color="var(--color-core-white)"><h5>Expense ID</h5></Table.ColumnHeader>
            <Table.ColumnHeader color="var(--color-core-white)"><h5>Date</h5></Table.ColumnHeader>
            {showDescription && (
              <Table.ColumnHeader color="var(--color-core-white)"><h5>Description</h5></Table.ColumnHeader>
            )}
            <Table.ColumnHeader color="var(--color-core-white)"><h5>Type of Expense</h5></Table.ColumnHeader>
            <Table.ColumnHeader color="var(--color-core-white)"><h5>Amount</h5></Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
  
        <Table.Body>
          {expenditures.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={showDescription ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>
                No expenditures found.
              </Table.Cell>
            </Table.Row>
          ) : (
            expenditures.map((e) => (
              <Table.Row key={e.expenditure_id}>
                <Table.Cell>#{String(e.expenditure_id).padStart(6, '0')}</Table.Cell>
                <Table.Cell>
                  {new Date(e.spent_on).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                  })}
                </Table.Cell>
                {showDescription && (
                  <Table.Cell>{e.description ?? '—'}</Table.Cell>
                )}
                <Table.Cell>{e.category ?? '—'}</Table.Cell>
                <Table.Cell>
                  ${parseFloat(e.amount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    );
  }