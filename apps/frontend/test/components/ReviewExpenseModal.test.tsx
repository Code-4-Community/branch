import { render, screen, fireEvent, waitFor } from '../utils';
import ReviewExpenseModal from '@/app/components/ReviewExpenseModal';
import {
  getExpenditure,
  getReceiptDownloadUrl,
  reviewExpenditure,
} from '@/lib/expenditures';
import { adminSubject, memberSubject, session } from '../rbac';

// The dialog asks the shared policy whether the caller may review, so the
// mocked session has to carry a subject; `isAdmin` alone denies everything.
let authState = session({ subject: memberSubject() });

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => authState,
}));

jest.mock('../../src/lib/expenditures', () => ({
  getExpenditure: jest.fn(),
  getReceiptDownloadUrl: jest.fn(),
  reviewExpenditure: jest.fn(),
}));

const detail = {
  expenditureId: 5,
  projectId: 1,
  projectName: 'Project Name 2',
  enteredBy: 3,
  submittedByName: 'Ada Lovelace',
  amount: '1200',
  category: 'Travel Foreign',
  description: 'Flight to the field site',
  status: 'pending' as const,
  adminNotes: null,
  receiptUrl: 'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/12345-receipt.pdf',
  spent_on: '2026-05-15',
  createdAt: '2026-05-15',
};

const baseProps = {
  expenditureId: 5,
  open: true,
  onClose: jest.fn(),
  onReviewed: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  authState = session({ subject: memberSubject() });
  (getExpenditure as jest.Mock).mockResolvedValue(detail);
});

describe('ReviewExpenseModal', () => {
  it('renders the submitted expense details', async () => {
    render(<ReviewExpenseModal {...baseProps} />);

    expect(await screen.findByText('Review Expense')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Travel Foreign')).toBeInTheDocument();
    expect(screen.getByText('Flight to the field site')).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  });

  describe('non-admin', () => {
    it('hides the admin decision, admin notes, and save button', async () => {
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      expect(screen.queryByText('Admin Decision*')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin Notes*')).not.toBeInTheDocument();
      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    });

    it('still shows the read-only status', async () => {
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      expect(screen.getByText('Status:')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('admin', () => {
    beforeEach(() => {
      authState = session({ subject: adminSubject() });
    });

    it('shows the three decision pills, admin notes, and save button', async () => {
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      expect(screen.getByText('Admin Decision*')).toBeInTheDocument();
      expect(screen.getByText('Admin Notes*')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Needs Info')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('requires admin notes before saving', async () => {
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      fireEvent.click(screen.getByText('Save Changes'));

      expect(await screen.findByText('Enter admin notes')).toBeInTheDocument();
      expect(reviewExpenditure).not.toHaveBeenCalled();
    });

    it('submits the chosen decision with the notes', async () => {
      (reviewExpenditure as jest.Mock).mockResolvedValue(undefined);
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      fireEvent.click(screen.getByText('Needs Info'));
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), {
        target: { value: 'Please attach the itemised receipt' },
      });
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() =>
        expect(reviewExpenditure).toHaveBeenCalledWith(
          5,
          'needs_more_info',
          'Please attach the itemised receipt',
        ),
      );
      expect(baseProps.onReviewed).toHaveBeenCalled();
    });

    it('surfaces a save failure', async () => {
      (reviewExpenditure as jest.Mock).mockRejectedValue(new Error('Server exploded'));
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      fireEvent.click(screen.getByText('Approved'));
      fireEvent.change(screen.getByPlaceholderText('Placeholder'), {
        target: { value: 'Looks good' },
      });
      fireEvent.click(screen.getByText('Save Changes'));

      expect(await screen.findByText('Server exploded')).toBeInTheDocument();
      expect(baseProps.onReviewed).not.toHaveBeenCalled();
    });
  });

  it('opens the receipt through a presigned URL rather than the object URL', async () => {
    (getReceiptDownloadUrl as jest.Mock).mockResolvedValue({
      downloadUrl: 'https://signed.example/receipt',
      fileName: '12345-receipt.pdf',
    });
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<ReviewExpenseModal {...baseProps} />);
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByText('view pdf'));

    await waitFor(() => expect(getReceiptDownloadUrl).toHaveBeenCalledWith(5));
    expect(openSpy).toHaveBeenCalledWith(
      'https://signed.example/receipt',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });
});
