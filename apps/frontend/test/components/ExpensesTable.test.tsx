import { render, screen, fireEvent } from '../utils';
import ExpensesTable from '@/app/components/ExpensesTable';
import type { Expenditure } from '@/types';

function makeExpenditure(overrides: Partial<Expenditure> = {}): Expenditure {
  return {
    expenditure_id: 5,
    project_id: 1,
    entered_by: 3,
    amount: '1200',
    category: 'Travel Foreign',
    description: 'Flight',
    status: 'pending',
    receipt_url: 'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/12345-receipt.pdf',
    admin_notes: null,
    spent_on: '2026-05-15',
    created_at: '2026-05-15',
    ...overrides,
  };
}

const projectNames = { 1: 'Project Name 2' };

describe('ExpensesTable', () => {
  it('renders the Figma column set', () => {
    render(<ExpensesTable expenditures={[makeExpenditure()]} projectNames={projectNames} />);

    ['Expense ID', 'Date', 'Type of Expense', 'Project', 'Amount', 'Receipt', 'Status'].forEach(
      (header) => expect(screen.getByText(header)).toBeInTheDocument(),
    );
    // Description was dropped from the design's table.
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('renders a status pill per row', () => {
    render(
      <ExpensesTable
        expenditures={[
          makeExpenditure({ expenditure_id: 1, status: 'approved' }),
          makeExpenditure({ expenditure_id: 2, status: 'pending' }),
          makeExpenditure({ expenditure_id: 3, status: 'needs_more_info' }),
        ]}
        projectNames={projectNames}
      />,
    );

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Needs Info')).toBeInTheDocument();
  });

  it('shows the project name and formatted amount', () => {
    render(<ExpensesTable expenditures={[makeExpenditure()]} projectNames={projectNames} />);

    expect(screen.getByText('Project Name 2')).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
    expect(screen.getByText('#000005')).toBeInTheDocument();
  });

  it('renders --- when there is no receipt', () => {
    render(
      <ExpensesTable expenditures={[makeExpenditure({ receipt_url: null })]} projectNames={projectNames} />,
    );

    expect(screen.queryByText('View Receipt')).not.toBeInTheDocument();
    expect(screen.getByText('---')).toBeInTheDocument();
  });

  it('calls onViewReceipt without opening the row', () => {
    const onViewReceipt = jest.fn();
    const onRowClick = jest.fn();
    render(
      <ExpensesTable
        expenditures={[makeExpenditure()]}
        projectNames={projectNames}
        onViewReceipt={onViewReceipt}
        onRowClick={onRowClick}
      />,
    );

    fireEvent.click(screen.getByText('View Receipt'));

    expect(onViewReceipt).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('opens the review modal when the row is clicked', () => {
    const onRowClick = jest.fn();
    render(
      <ExpensesTable
        expenditures={[makeExpenditure()]}
        projectNames={projectNames}
        onRowClick={onRowClick}
      />,
    );

    fireEvent.click(screen.getByText('Travel Foreign'));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].expenditure_id).toBe(5);
  });

  it('hides the Project column on the project detail page', () => {
    render(<ExpensesTable expenditures={[makeExpenditure()]} showProject={false} />);

    expect(screen.queryByText('Project')).not.toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<ExpensesTable expenditures={[]} />);
    expect(screen.getByText('No expenditures found.')).toBeInTheDocument();
  });
});
