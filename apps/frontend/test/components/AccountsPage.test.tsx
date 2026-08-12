import { render, screen } from '../utils';
import AccountsPage from '@/app/accounts/page';
import { facilitationTeam, teamMembers } from '@/app/accounts/mockUsers';

describe('AccountsPage', () => {
    it('renders the headings', () => {
        render(<AccountsPage />);
        expect(screen.getByText('Accounts')).toBeInTheDocument();
        expect(screen.getByText('Core BRANCH Facilitation Team')).toBeInTheDocument();
        expect(screen.getByText('BRANCH Team Members')).toBeInTheDocument();
    });

    it('renders the correct staff cards in the facilitation section', () => {
        render(<AccountsPage />);
        const section = screen.getByText('Core BRANCH Facilitation Team').closest('div');
        const cards = section?.querySelectorAll('[data-testid="staff-card"]');

        if (facilitationTeam.length === 0) {
            expect(cards?.length).toBe(0);
        } else {
            expect(cards?.length).toBeGreaterThan(0);
        }
    });

    it('renders the correct staff cards in the team members section', () => {
        render(<AccountsPage />);
        const section = screen.getByText('BRANCH Team Members').closest('div');
        const cards = section?.querySelectorAll('[data-testid="staff-card"]');

        if (teamMembers.length === 0) {
            expect(cards?.length).toBe(0);
        } else {
            expect(cards?.length).toBeGreaterThan(0);
        }
    });
});