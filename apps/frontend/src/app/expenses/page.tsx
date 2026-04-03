'use client';
import { Input, Table } from '@chakra-ui/react';
import Header from '../components/Header';
import { ReactNode, useEffect, useState } from 'react';

type Expenditure = {
  expenditure_id: number;
  project_id: number;
  entered_by: number | null;
  amount: string;
  category: string | null;
  description: string | null;
  spent_on: string;
  created_at: string | null;
};

function ColumnHeader({
  children,
  ...rest
}: { children: ReactNode } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <Table.ColumnHeader
      fontWeight="bold"
      color="white"
      cursor="pointer"
      className="bg-primary-800"
      {...rest}
    >
      {children}
    </Table.ColumnHeader>
  );
}

type SortKey = 'expenditure_id' | 'spent_on' | 'description' | 'amount' | 'category';
type SortOrder = 'asc' | 'desc';

export default function ExpensePage() {
  const [query, setQuery] = useState('');
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('spent_on');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    async function fetchExpenditures() {
      try {
        const res = await fetch('/api/expenditures', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch expenditures: ${res.status}`);
        }
        const data: Expenditure[] = await res.json();
        setExpenditures(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load expenditures');
      } finally {
        setLoading(false);
      }
    }
    fetchExpenditures();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const sortedData = [...expenditures]
    .filter(
      (e) =>
        e.expenditure_id.toString().includes(query.toLowerCase()) ||
        (e.description ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (e.category ?? '').toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (sortKey === 'amount') {
        const diff = parseFloat(String(aVal)) - parseFloat(String(bVal));
        return sortOrder === 'asc' ? diff : -diff;
      }

      return sortOrder === 'asc'
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''))
        : String(bVal ?? '').localeCompare(String(aVal ?? ''));
    });

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <>
      <Header />

      <div className="px-8 py-6">
        <h1 className="mb-4">Expenses</h1>

        <Input
          placeholder="Search by ID, description, or category"
          onChange={(e) => setQuery(e.target.value)}
          value={query}
          className="!mb-4 !max-w-md !rounded !border !border-black-200 !px-3 !py-2 !font-body"
        />

        {loading && <p>Loading expenditures...</p>}
        {error && <p className="text-error-red">{error}</p>}

        {!loading && !error && (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <ColumnHeader onClick={() => handleSort('expenditure_id')}>
                  Expense ID{sortIndicator('expenditure_id')}
                </ColumnHeader>
                <ColumnHeader onClick={() => handleSort('spent_on')}>
                  Date{sortIndicator('spent_on')}
                </ColumnHeader>
                <ColumnHeader onClick={() => handleSort('description')}>
                  Description{sortIndicator('description')}
                </ColumnHeader>
                <ColumnHeader onClick={() => handleSort('category')}>
                  Category{sortIndicator('category')}
                </ColumnHeader>
                <ColumnHeader onClick={() => handleSort('amount')}>
                  Amount{sortIndicator('amount')}
                </ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sortedData.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={5} className="!text-center !py-8 !text-black-500">
                    No expenditures found.
                  </Table.Cell>
                </Table.Row>
              ) : (
                sortedData.map((e) => (
                  <Table.Row key={e.expenditure_id}>
                    <Table.Cell>#{e.expenditure_id}</Table.Cell>
                    <Table.Cell>
                      {new Date(e.spent_on).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>{e.description ?? '—'}</Table.Cell>
                    <Table.Cell>{e.category ?? '—'}</Table.Cell>
                    <Table.Cell>
                      ${parseFloat(e.amount).toFixed(2)}
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        )}
      </div>
    </>
  );
}
