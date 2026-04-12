import { render, screen } from '../utils';
import LoginPage from '@/app/login/page';


describe('Login Page Component', () => {
    it('renders the login heading', () => {
        render(<LoginPage />);
        expect(screen.getByText('Login', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the branch subheading', () => {
        render(<LoginPage />);
        expect(screen.getByText('BRANCH Accounting Platform', { selector: 'h5' })).toBeInTheDocument();
    });

    it('renders the email and password input fields', () => {
        render(<LoginPage />);
        expect(screen.getByPlaceholderText('Enter email address')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    });

    it('renders the login button', () => {
        render(<LoginPage />);
        const button = screen.getByRole('button', { name: 'Login' });
        expect(button).toBeInTheDocument();
    });

    it('renders the forgot password link pointing to /forgot-password', () => {
        render(<LoginPage />);
        const link = screen.getByRole('link', { name: 'Forgot password?' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/forgot-password');
    });
});
