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

    // Regression guard for #300: the accounts page is a signed-in app route, so
    // it must keep the sidebar the way every other app page does. It used to
    // render only its content with no NavBar, which stranded the user with no
    // way to navigate away.
    it('renders the sidebar so it persists on the accounts page', () => {
        render(<AccountsPage />);
        expect(screen.getByRole('navigation')).toBeInTheDocument();
        expect(screen.getAllByText('BRANCH').length).toBeGreaterThan(0);
    });
});