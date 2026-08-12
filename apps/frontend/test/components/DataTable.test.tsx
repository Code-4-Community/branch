import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent, within } from '../utils';
import DataTable, { type DataTableColumn } from '@/app/components/DataTable';

type Row = { id: number; name: string; amount: string };

const rows: Row[] = [
  { id: 1, name: 'First', amount: '$10' },
  { id: 2, name: 'Second', amount: '$20' },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', width: '70%', cell: (row) => row.name },
  { key: 'amount', header: 'Amount', width: '30%', align: 'right', cell: (row) => row.amount },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} {...props} />,
  );
}

describe('DataTable', () => {
  it('renders a header and a row per record', () => {
    renderTable();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('$20')).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    renderTable({ rows: [], emptyMessage: 'Nothing here.' });

    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  describe('when loading', () => {
    it('keeps the header and replaces the rows with skeletons', () => {
      renderTable({ isLoading: true, skeletonRows: 4, loadingLabel: 'Loading things…' });

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.queryByText('First')).not.toBeInTheDocument();
      // Header row plus one row per skeleton.
      expect(screen.getAllByRole('row')).toHaveLength(5);
    });

    it('announces itself once', () => {
      renderTable({ isLoading: true, loadingLabel: 'Loading things…' });

      expect(screen.getByRole('status')).toHaveTextContent('Loading things…');
    });

    it('does not fall back to the empty message', () => {
      renderTable({ isLoading: true, rows: [], emptyMessage: 'Nothing here.' });

      expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument();
    });
  });

  describe('row interaction', () => {
    it('calls onRowClick when a row is clicked', () => {
      const onRowClick = jest.fn();
      renderTable({ onRowClick });

      fireEvent.click(screen.getByText('Second'));

      expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    });

    it('opens a row from the keyboard', () => {
      const onRowClick = jest.fn();
      renderTable({ onRowClick });

      const row = screen.getByText('First').closest('tr') as HTMLElement;
      fireEvent.keyDown(row, { key: 'Enter' });

      expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it('leaves rows unfocusable when they are not clickable', () => {
      renderTable();

      const row = screen.getByText('First').closest('tr') as HTMLElement;
      expect(row).not.toHaveAttribute('tabindex');
    });
  });

  describe('selection', () => {
    const selection = {
      label: 'Select all rows',
      isSelected: (row: Row) => row.id === 1,
      onToggleRow: jest.fn(),
      allSelected: false,
      someSelected: true,
      onToggleAll: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('adds a checkbox column', () => {
      renderTable({ selection });

      expect(screen.getByLabelText('Select all rows')).toBeInTheDocument();
    });

    it('toggles a single row', async () => {
      const user = userEvent.setup();
      renderTable({ selection });

      const row = screen.getByText('Second').closest('tr') as HTMLElement;
      await user.click(within(row).getByRole('checkbox'));

      expect(selection.onToggleRow).toHaveBeenCalledWith(rows[1]);
    });

    it('does not open the row when its checkbox is clicked', async () => {
      const user = userEvent.setup();
      const onRowClick = jest.fn();
      renderTable({ selection, onRowClick });

      const row = screen.getByText('First').closest('tr') as HTMLElement;
      await user.click(within(row).getByRole('checkbox'));

      expect(selection.onToggleRow).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });
});
