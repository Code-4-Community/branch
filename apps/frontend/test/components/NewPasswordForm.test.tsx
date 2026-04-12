import { render, screen } from '../utils';
import NewPasswordForm from '@/app/components/NewPasswordForm';


describe('New Password Form Component', () => {
    it('renders the form heading', () => {
        render(<NewPasswordForm />);
        expect(screen.getByText('Reset Password', { selector: 'h1' })).toBeInTheDocument();
      });
    
    it('renders the 2 password input fields', () => {
        render(<NewPasswordForm />);
        expect(screen.getByPlaceholderText('Enter new password')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Retype password')).toBeInTheDocument();
    });

    it('renders the reset password button', () => {
        render(<NewPasswordForm />);
        const button = screen.getByRole('button', { name: 'Reset Password' });
        expect(button).toBeInTheDocument();
    })
});