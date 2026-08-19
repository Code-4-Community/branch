import { render, screen, waitFor } from '../utils';
import AccountsPage from '@/app/accounts/page';
import { facilitationTeam, teamMembers } from '@/app/accounts/mockUsers';

describe('AccountsPage', () => {
    beforeEach(() => {
        localStorage.setItem('branch_access_token', 'fake.access.token');
        localStorage.setItem('branch_id_token', 'fake.id.token');
        localStorage.setItem('branch_refresh_token', 'fake.refresh');

        global.fetch = jest.fn().mockImplementation((input: RequestInfo) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            if (url.includes('/auth/me')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ userId: 1, cognitoSub: 'sub-test', email: 'test@example.com', name: 'Test User', isAdmin: false }) } as unknown as Response);
            }
            return Promise.resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        localStorage.clear();
    });

    it('renders the headings', () => {
        render(<AccountsPage />);
        expect(screen.getByText('Accounts')).toBeInTheDocument();
        expect(screen.getByText('Core BRANCH Facilitation Team')).toBeInTheDocument();
        expect(screen.getByText('BRANCH Team Members')).toBeInTheDocument();
    });

    it('renders the correct staff cards in the facilitation section', async () => {
        render(<AccountsPage />);
        const sectionHeader = await screen.findByText('Core BRANCH Facilitation Team');
        await waitFor(() => {
            const section = sectionHeader.closest('div');
            const cards = section?.querySelectorAll('[data-testid="staff-card"]');

            if (facilitationTeam.length === 0) {
                expect(cards?.length).toBe(0);
            } else {
                expect(cards?.length).toBeGreaterThan(0);
            }
        });
    });

    it('renders the correct staff cards in the team members section', async () => {
        render(<AccountsPage />);
        const sectionHeader = await screen.findByText('BRANCH Team Members');
        await waitFor(() => {
            const section = sectionHeader.closest('div');
            const cards = section?.querySelectorAll('[data-testid="staff-card"]');

            if (teamMembers.length === 0) {
                expect(cards?.length).toBe(0);
            } else {
                expect(cards?.length).toBeGreaterThan(0);
            }
        });
    });
});