import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { render, screen, waitFor, within } from '../utils';
import StaffConsolePage from '@/app/staff/page';
import { directorSubject, staffSubject } from '../rbac';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

const targets = [
  {
    userId: 4,
    name: 'Sam Okafor',
    email: 'sam@branch.org',
    isAdmin: false,
    pending: false,
    directorProjectCount: 1,
    memberProjectCount: 1,
  },
  {
    userId: 6,
    name: 'Diego Alvarez',
    email: 'diego@branch.org',
    isAdmin: false,
    pending: true,
    directorProjectCount: 0,
    memberProjectCount: 1,
  },
];

const replace = jest.fn();

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ users: targets });
  replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ replace });
});

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('StaffConsolePage', () => {
  it('lists the users a staff account can switch into, with their role', async () => {
    render(<StaffConsolePage />, { subject: staffSubject() });

    expect(await screen.findByText('Sam Okafor')).toBeInTheDocument();
    expect(within(rowFor('Sam Okafor')).getByText('Director')).toBeInTheDocument();
    expect(within(rowFor('Diego Alvarez')).getByText('(never signed in)')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/auth/impersonation/targets', { method: 'GET' });
  });

  it('searches on the server', async () => {
    render(<StaffConsolePage />, { subject: staffSubject() });
    await screen.findByText('Sam Okafor');

    await userEvent.type(screen.getByLabelText('Search by name or email'), 'sam');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith('/auth/impersonation/targets?search=sam', {
        method: 'GET',
      }),
    );
  });

  it('"View as" switches in read-only and lands where that user would', async () => {
    const startImpersonation = jest.fn().mockResolvedValue({ rbac: directorSubject([1], 4) });
    render(<StaffConsolePage />, { subject: staffSubject(), auth: { startImpersonation } });
    await screen.findByText('Sam Okafor');

    await userEvent.click(within(rowFor('Sam Okafor')).getByRole('button', { name: 'View as' }));

    expect(startImpersonation).toHaveBeenCalledWith(4, 'read_only');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
  });

  it('"Act as" asks first, then switches in with full access', async () => {
    const startImpersonation = jest.fn().mockResolvedValue({ rbac: directorSubject([1], 4) });
    render(<StaffConsolePage />, { subject: staffSubject(), auth: { startImpersonation } });
    await screen.findByText('Sam Okafor');

    await userEvent.click(within(rowFor('Sam Okafor')).getByRole('button', { name: 'Act as' }));
    expect(startImpersonation).not.toHaveBeenCalled();

    expect(await screen.findByText('Act as this user with full access?')).toBeInTheDocument();
    expect(screen.getByText('Sam Okafor (sam@branch.org)')).toBeInTheDocument();
    expect(screen.queryByText(/delete sam okafor/i)).not.toBeInTheDocument();
    expect(screen.queryByText('This cannot be undone.')).not.toBeInTheDocument();
    // The dialog portals to the end of <body>, so its confirm is the last "Act as".
    const confirm = screen.getAllByRole('button', { name: 'Act as' }).at(-1)!;
    await userEvent.click(confirm);

    await waitFor(() => expect(startImpersonation).toHaveBeenCalledWith(4, 'full'));
  });

  it('shows why a switch failed', async () => {
    const startImpersonation = jest.fn().mockRejectedValue(new Error('User not found'));
    render(<StaffConsolePage />, { subject: staffSubject(), auth: { startImpersonation } });
    await screen.findByText('Sam Okafor');

    await userEvent.click(within(rowFor('Sam Okafor')).getByRole('button', { name: 'View as' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
    expect(replace).not.toHaveBeenCalled();
  });
});
