import { render, screen } from '../utils';
import ResetPasswordForm from '@/app/components/ResetPasswordForm';

describe('ResetPasswordForm Component', () => {
    it('renders the heading', () => {
        render(<ResetPasswordForm />);
        expect(screen.getByText('Forgot your Password?', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the subheading', () => {
        render(<ResetPasswordForm />);
        expect(screen.getByText(/please enter the email address/i, { selector: 'h5' })).toBeInTheDocument();
    });

    it('renders the email input field', () => {
        render(<ResetPasswordForm />);
        expect(screen.getByPlaceholderText('Placeholder')).toBeInTheDocument();
    });

    it('renders the request reset link button', () => {
        render(<ResetPasswordForm />);
        expect(screen.getByRole('button', { name: 'Request reset link' })).toBeInTheDocument();
    });

    it('renders the back to login link', () => {
        render(<ResetPasswordForm />);
        const link = screen.getByRole('link', { name: 'Back to login' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '#');
    });
});
