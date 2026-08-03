import { render, screen, waitFor, signIn, signOut } from '../utils';
import AccountsPage, { facilitationTeam, teamMembers } from '@/app/accounts/page';

describe('AccountsPage', () => {
    beforeEach(() => {
        signIn();
    });
    afterEach(() => {
        signOut();
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