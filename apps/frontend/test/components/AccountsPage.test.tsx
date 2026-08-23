import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../utils';
import AccountsPage from '@/app/accounts/page';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
    ...jest.requireActual('../../src/lib/authClient'),
    authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

const users = [
    { user_id: 1, name: 'Ada Admin', email: 'ada@branch.org', is_admin: true },
    { user_id: 2, name: 'Sam Staff', email: 'sam@branch.org', is_admin: false },
];

beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((url: string, init?: { method?: string }) => {
        if (url === '/users' && (!init || init.method === 'GET')) {
            return Promise.resolve({ users });
        }
        return Promise.resolve({ ok: true });
    });
});

describe('AccountsPage', () => {
    it('renders the headings', async () => {
        render(<AccountsPage />);
        expect(await screen.findByText('Accounts')).toBeInTheDocument();
        expect(screen.getByText('Core BRANCH Facilitation Team')).toBeInTheDocument();
        expect(screen.getByText('BRANCH Team Members')).toBeInTheDocument();
    });

    it('lists users from the API rather than a hardcoded roster', async () => {
        render(<AccountsPage />);
        expect(await screen.findByText('Ada Admin')).toBeInTheDocument();
        expect(screen.getByText('Sam Staff')).toBeInTheDocument();
        expect(mockApiFetch).toHaveBeenCalledWith('/users', { method: 'GET' });
    });

    it('splits admins and non-admins into the two sections', async () => {
        render(<AccountsPage />);
        await screen.findByText('Ada Admin');

        const cards = screen.getAllByTestId('staff-card');
        expect(cards).toHaveLength(2);
        expect(within(cards[0]).getByText('Ada Admin')).toBeInTheDocument();
        expect(within(cards[1]).getByText('Sam Staff')).toBeInTheDocument();
    });

    it('deletes a user after the confirmation is accepted', async () => {
        render(<AccountsPage />);
        await screen.findByText('Sam Staff');

        await userEvent.click(screen.getByRole('button', { name: 'Delete Sam Staff' }));

        const dialog = await screen.findByRole('alertdialog');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete User' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/users/2', { method: 'DELETE' });
        });
    });

    it('does not issue the request until the user confirms', async () => {
        render(<AccountsPage />);
        await screen.findByText('Sam Staff');

        await userEvent.click(screen.getByRole('button', { name: 'Delete Sam Staff' }));
        await screen.findByRole('alertdialog');

        expect(mockApiFetch).not.toHaveBeenCalledWith('/users/2', { method: 'DELETE' });
    });
});
