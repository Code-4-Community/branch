import { render, screen, fireEvent, waitFor } from '../utils';
import AddExpenseModal from '@/app/components/AddExpenseModal';
import { authedFetch as apiFetch } from '@/lib/authClient';

jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: jest.fn(),
}));

// Mock DropdownSelector — render a simple native select so we can drive it
jest.mock('../../src/app/components/DropdownSelector', () => {
  return function MockDropdownSelector({
    options,
    placeholder,
    value,
    onChange,
  }: {
    options: string[];
    placeholder?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) {
    return (
      <select
        aria-label={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled>-- {placeholder} --</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  };
});

// Mock FileUpload — expose a button that reports a finished upload
jest.mock('../../src/app/components/FileUpload', () => {
  return function MockFileUpload({
    onChange,
  }: {
    onChange: (file: File | null, objectUrl: string | null) => void;
  }) {
    return (
      <button
        type="button"
        onClick={() =>
          onChange(
            new File(['x'], 'receipt.pdf', { type: 'application/pdf' }),
            'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/receipt.pdf',
          )
        }
      >
        mock-select-file
      </button>
    );
  };
});

const baseProps = {
  open: true,
  onClose: jest.fn(),
  onSuccess: jest.fn(),
  categories: ['Travel Foreign', 'Supplies'],
  projects: [
    { project_id: 1, name: 'Project Name 1' },
    { project_id: 2, name: 'Project Name 2' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AddExpenseModal Component', () => {
  it('renders the modal title when open', () => {
    render(<AddExpenseModal {...baseProps} />);
    expect(screen.getByText('Add New Expense')).toBeInTheDocument();
  });

  it('renders all field labels', () => {
    render(<AddExpenseModal {...baseProps} />);
    expect(screen.getByText('Date*')).toBeInTheDocument();
    expect(screen.getByText('Amount*')).toBeInTheDocument();
    expect(screen.getByText('Type of Expense*')).toBeInTheDocument();
    expect(screen.getByText('Project*')).toBeInTheDocument();
    expect(screen.getByText('Description*')).toBeInTheDocument();
    expect(screen.getByText('Upload Receipt')).toBeInTheDocument();
  });

  it('renders the date input', () => {
    render(<AddExpenseModal {...baseProps} />);
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
  });

  it('renders the amount input with placeholder', () => {
    render(<AddExpenseModal {...baseProps} />);
    expect(screen.getByPlaceholderText('Enter the Amount')).toBeInTheDocument();
  });

  it('renders Cancel and Submit buttons', () => {
    render(<AddExpenseModal {...baseProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Submit For Review')).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', () => {
    render(<AddExpenseModal {...baseProps} />);
    fireEvent.click(screen.getByText('Submit For Review'));
  
    expect(screen.getByText('Enter a valid amount')).toBeInTheDocument();
    expect(screen.getByText('Select a type of expense')).toBeInTheDocument();
    expect(screen.getByText('Select a project')).toBeInTheDocument();
    expect(screen.getByText('Enter a description')).toBeInTheDocument();
    expect(screen.getByText('Please upload an image of the receipt')).toBeInTheDocument();
  });

  it('does not call apiFetch when the form is invalid', () => {
    render(<AddExpenseModal {...baseProps} />);
    fireEvent.click(screen.getByText('Submit For Review'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('calls apiFetch with the correct payload when the form is valid', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({});
    render(<AddExpenseModal {...baseProps} />);

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2025-05-15' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter the Amount'), {
      target: { value: '12000' },
    });
    fireEvent.change(screen.getByLabelText('Select type'), {
      target: { value: 'Travel Foreign' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Project Name 2' },
    });
    fireEvent.change(screen.getByPlaceholderText('Placeholder'), {
      target: { value: 'A test description' },
    });
    fireEvent.click(screen.getByText('mock-select-file'));

    fireEvent.click(screen.getByText('Submit For Review'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/expenditures',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            projectID: 2,
            amount: 12000,
            category: 'Travel Foreign',
            description: 'A test description',
            spentOn: '2025-05-15',
            receiptUrl: 'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/receipt.pdf',
          }),
        }),
      );
    });
  });

  it('calls onSuccess after a successful submit', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({});
    render(<AddExpenseModal {...baseProps} />);

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2025-05-15' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter the Amount'), {
      target: { value: '12000' },
    });
    fireEvent.change(screen.getByLabelText('Select type'), {
      target: { value: 'Travel Foreign' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Project Name 2' },
    });
    fireEvent.change(screen.getByPlaceholderText('Placeholder'), {
      target: { value: 'A test description' },
    });
    fireEvent.click(screen.getByText('mock-select-file'));
    fireEvent.click(screen.getByText('Submit For Review'));

    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a submit error if apiFetch rejects', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('Server exploded'));
    render(<AddExpenseModal {...baseProps} />);

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2025-05-15' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter the Amount'), {
      target: { value: '12000' },
    });
    fireEvent.change(screen.getByLabelText('Select type'), {
      target: { value: 'Travel Foreign' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Project Name 2' },
    });
    fireEvent.change(screen.getByPlaceholderText('Placeholder'), {
      target: { value: 'A test description' },
    });
    fireEvent.click(screen.getByText('mock-select-file'));
    fireEvent.click(screen.getByText('Submit For Review'));

    await waitFor(() => {
      expect(screen.getByText('Server exploded')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<AddExpenseModal {...baseProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});