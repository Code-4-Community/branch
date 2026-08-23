import { render, screen, fireEvent, waitFor } from '../utils';
import ReviewExpenseModal from '@/app/components/ReviewExpenseModal';
import {
  getExpenditure,
  getReceiptDownloadUrl,
  reviewExpenditure,
  updateExpenditure,
} from '@/lib/expenditures';
import { adminSubject, memberSubject, session } from '../rbac';

// The dialog asks the shared policy whether the caller may review, so the
// mocked session has to carry a subject; `isAdmin` alone denies everything.
// userId 9 is a member of the project but not the author of `detail`, which is
// the read-only case; the author's own view is exercised further down.
const OTHER_MEMBER = memberSubject([1], 9);
const AUTHOR = memberSubject([1], 3);

let authState = session({ subject: OTHER_MEMBER });

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => authState,
}));

jest.mock('../../src/lib/expenditures', () => ({
  getExpenditure: jest.fn(),
  getReceiptDownloadUrl: jest.fn(),
  reviewExpenditure: jest.fn(),
  updateExpenditure: jest.fn(),
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
  authState = session({ subject: OTHER_MEMBER });
  (getExpenditure as jest.Mock).mockResolvedValue(detail);
});

describe('ReviewExpenseModal', () => {
  it('renders the submitted expense details', async () => {
    render(<ReviewExpenseModal {...baseProps} />);

    // Not "Review Expense": the title now names what this viewer may do.
    expect(await screen.findByText('Expense')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Travel Foreign')).toBeInTheDocument();
    expect(screen.getByText('Flight to the field site')).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  });

  describe('a member who did not submit it', () => {
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

  describe('the submitter', () => {
    beforeEach(() => {
      authState = session({ subject: AUTHOR });
    });

    it('offers the editable fields the PATCH route accepts', async () => {
      render(<ReviewExpenseModal {...baseProps} />);

      expect(await screen.findByText('Edit Expense')).toBeInTheDocument();
      expect(screen.getByLabelText('Amount')).toHaveValue(1200);
      expect(screen.getByLabelText('Description')).toHaveValue('Flight to the field site');
      // Reviewing stays admin-only even on their own expense.
      expect(screen.queryByText('Admin Decision*')).not.toBeInTheDocument();
    });

    it('sends only the fields that changed', async () => {
      (updateExpenditure as jest.Mock).mockResolvedValue(undefined);
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByLabelText('Amount');

      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1500' } });
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => expect(updateExpenditure).toHaveBeenCalledWith(5, { amount: 1500 }));
      expect(reviewExpenditure).not.toHaveBeenCalled();
      expect(baseProps.onReviewed).toHaveBeenCalled();
    });

    it('refuses a cleared amount rather than sending zero', async () => {
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByLabelText('Amount');

      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } });
      fireEvent.click(screen.getByText('Save Changes'));

      expect(await screen.findByText('Enter an amount')).toBeInTheDocument();
      expect(updateExpenditure).not.toHaveBeenCalled();
    });

    it('goes read-only once an admin has decided it, and says why', async () => {
      (getExpenditure as jest.Mock).mockResolvedValue({ ...detail, status: 'approved' });
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
      expect(
        screen.getByText('Approved expenses can only be edited by an administrator'),
      ).toBeInTheDocument();
    });

    it('says so in the denial wording when the expense was denied', async () => {
      (getExpenditure as jest.Mock).mockResolvedValue({ ...detail, status: 'denied' });
      render(<ReviewExpenseModal {...baseProps} />);
      await screen.findByText('Ada Lovelace');

      expect(
        screen.getByText('Denied expenses can only be edited by an administrator'),
      ).toBeInTheDocument();
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
