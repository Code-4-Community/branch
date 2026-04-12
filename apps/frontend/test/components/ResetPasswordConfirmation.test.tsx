import { render, screen } from '../utils';
import ResetPasswordConfirmation from '@/app/components/ResetPasswordConfirmation';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));


describe('Reset Password Confirmation Page Component', () => {
    
    it('renders the page heading', () => {
        render(<ResetPasswordConfirmation />);
        expect(screen.getByText('Password Changed', { selector: 'h1' })).toBeInTheDocument();
      });

    it('renders the subheading', () => {
        render(<ResetPasswordConfirmation />);
        expect(screen.getByText('Your password has been successfully changed!', { selector: 'h5' })).toBeInTheDocument();
    });

    it('renders the back to login button', () => {
        render(<ResetPasswordConfirmation />);
        const button = screen.getByRole('button', { name: 'Back to login' });
        expect(button).toBeInTheDocument();
    })
    
    it('navigates to login page when back to login button is clicked', () => {
        render(<ResetPasswordConfirmation />);
        const button = screen.getByRole('button', { name: 'Back to login' });
        button.click();
        expect(mockPush).toHaveBeenCalledWith('/login');
    });
});