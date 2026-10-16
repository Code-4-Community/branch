import { render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from '@/app/forgot-password/page';

const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => ({
    forgotPassword: mockForgotPassword,
    resetPassword: mockResetPassword,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

async function requestCode(email = 'jane@example.com') {
  await userEvent.type(screen.getByPlaceholderText('Enter email address'), email);
  await userEvent.click(screen.getByRole('button', { name: /Request reset/i }));
}

describe('Forgot Password Page', () => {
  it('collects the emailed code and a new password after sending', async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    mockResetPassword.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);

    await requestCode();

    expect(
      await screen.findByText(/We sent a verification code to jane@example.com/),
    ).toBeInTheDocument();
    expect(mockForgotPassword).toHaveBeenCalledWith('jane@example.com');

    await userEvent.type(screen.getByPlaceholderText('Enter verification code'), '123456');
    await userEvent.type(screen.getByPlaceholderText('Enter new password'), 'NewPassword1!');
    await userEvent.type(screen.getByPlaceholderText('Retype password'), 'NewPassword1!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith(
        'jane@example.com',
        '123456',
        'NewPassword1!',
      ),
    );
    expect(await screen.findByText('Password Changed')).toBeInTheDocument();
  });

  it('does not claim success when the code is wrong', async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    mockResetPassword.mockRejectedValue(new Error('Invalid verification code'));
    render(<ForgotPasswordPage />);

    await requestCode();
    await screen.findByPlaceholderText('Enter verification code');

    await userEvent.type(screen.getByPlaceholderText('Enter verification code'), '000000');
    await userEvent.type(screen.getByPlaceholderText('Enter new password'), 'NewPassword1!');
    await userEvent.type(screen.getByPlaceholderText('Retype password'), 'NewPassword1!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
    expect(screen.queryByText('Password Changed')).not.toBeInTheDocument();
  });
});
