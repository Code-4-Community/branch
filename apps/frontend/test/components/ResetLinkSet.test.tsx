import { render, screen } from '../utils';
import ResetLinkSet from '@/app/components/ResetLinkSet';

describe('ResetLinkSet Component', () => {
    it('renders the heading', () => {
        render(<ResetLinkSet />);
        expect(screen.getByText('Reset Link Sent!', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the subheading', () => {
        render(<ResetLinkSet />);
        expect(screen.getByText(/we sent a reset link/i, { selector: 'h5' })).toBeInTheDocument();
    });

    it('renders the request reset link again button', () => {
        render(<ResetLinkSet />);
        expect(screen.getByRole('button', { name: 'Request reset link again' })).toBeInTheDocument();
    });

    it('renders the back to login link', () => {
        render(<ResetLinkSet />);
        const link = screen.getByRole('link', { name: 'Back to login' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '#');
    });
});
