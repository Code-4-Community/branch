import { render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from '@/app/reset-password/page';

const mockPush = jest.fn();
const mockRouter = { push: mockPush, replace: jest.fn() };
let searchParams = new URLSearchParams('email=jane@example.com&code=123456');

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/reset-password',
  useSearchParams: () => searchParams,
}));

const mockResetPassword = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => ({ resetPassword: mockResetPassword }),
}));

async function submitNewPassword(password = 'NewPassword1!') {
  await userEvent.type(screen.getByPlaceholderText('Enter new password'), password);
  await userEvent.type(screen.getByPlaceholderText('Retype password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams('email=jane@example.com&code=123456');
});

describe('Reset Password Page', () => {
  it('shows the confirmation only after the request succeeds', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);

    await submitNewPassword();

    await waitFor(() => expect(screen.getByText('Password Changed')).toBeInTheDocument());
    expect(mockResetPassword).toHaveBeenCalledWith(
      'jane@example.com',
      '123456',
      'NewPassword1!',
    );
  });

  it('does NOT claim success when the request fails', async () => {
    // Regression guard: setSubmitted(true) used to live in `finally`, so users
    // were told their password had changed when it had not.
    mockResetPassword.mockRejectedValue(new Error('Invalid verification code'));
    render(<ResetPasswordPage />);

    await submitNewPassword();

    await waitFor(() =>
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Password Changed')).not.toBeInTheDocument();
  });

  it('rejects a weak password without calling the API', async () => {
    render(<ResetPasswordPage />);

    await submitNewPassword('weak');

    expect(mockResetPassword).not.toHaveBeenCalled();
    expect(screen.queryByText('Password Changed')).not.toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByPlaceholderText('Enter new password'), 'NewPassword1!');
    await userEvent.type(screen.getByPlaceholderText('Retype password'), 'Different1!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(screen.getByText('Password does not match')).toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it.each([
    ['code=123456', 'missing email'],
    ['email=jane@example.com', 'missing code'],
    ['', 'missing both'],
  ])('shows an expired-link state when the query string is incomplete (%s)', async (qs) => {
    searchParams = new URLSearchParams(qs);
    render(<ResetPasswordPage />);

    expect(screen.getByText('Link expired')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter new password')).not.toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });
});
