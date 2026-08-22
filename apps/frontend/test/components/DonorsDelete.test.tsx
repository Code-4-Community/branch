import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../utils';
import DonorsPage from '@/app/donors/page';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
    ...jest.requireActual('../../src/lib/authClient'),
    authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

// The delete column is admin-only, mirroring `DELETE /donors/{id}`.
jest.mock('../../src/context/AuthContext', () => ({
    ...jest.requireActual('../../src/context/AuthContext'),
    useAuth: () => ({
        user: { userId: 1, name: 'Ada', email: 'ada@branch.org', isAdmin: true },
        isAuthenticated: true,
        isAdmin: true,
        isLoading: false,
    }),
}));

const donors = [
    { donor_id: 1, organization: 'NIH', contact_name: null, contact_email: null },
    { donor_id: 2, organization: 'Horizon Trust', contact_name: null, contact_email: null },
];

const donations = [
    { donation_id: 10, donor_id: 1, project_id: 1, amount: '5000.00', donated_at: '2026-01-05T00:00:00' },
];

beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((url: string) => {
        if (url === '/donors') return Promise.resolve({ data: donors });
        if (url === '/donors/donations') return Promise.resolve({ data: donations });
        return Promise.resolve({ ok: true });
    });
});

describe('Donors page delete', () => {
    it('lists donors from the API with their donation counts', async () => {
        render(<DonorsPage />);
        expect(await screen.findByText('NIH')).toBeInTheDocument();
        expect(screen.getByText('Horizon Trust')).toBeInTheDocument();
        expect(mockApiFetch).toHaveBeenCalledWith('/donors', { method: 'GET' });
    });

    it('deletes a donor once confirmed', async () => {
        render(<DonorsPage />);
        await screen.findByText('NIH');

        await userEvent.click(screen.getByRole('button', { name: 'Delete NIH' }));

        const dialog = await screen.findByRole('alertdialog');
        // The donor has a donation, so the cascade has to be spelled out.
        expect(dialog).toHaveTextContent('1 recorded donation');

        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Donor' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/donors/1', { method: 'DELETE' });
        });
    });

    it('persists a new donor instead of only closing the dialog', async () => {
        render(<DonorsPage />);
        await screen.findByText('NIH');

        await userEvent.click(screen.getByRole('button', { name: /New Donor/i }));
        await screen.findByText('Add New Donor');

        await userEvent.type(screen.getByPlaceholderText('Organization name'), 'New Org');
        await userEvent.type(screen.getByPlaceholderText('Contact name'), 'Pat');
        await userEvent.type(screen.getByPlaceholderText('Contact email'), 'pat@new.org');
        await userEvent.click(screen.getByRole('button', { name: 'Add Donor' }));

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/donors', {
                method: 'POST',
                body: JSON.stringify({
                    organization: 'New Org',
                    contact_name: 'Pat',
                    contact_email: 'pat@new.org',
                }),
            });
        });
    });
});
