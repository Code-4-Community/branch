import { render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import ProfilePage from '@/app/profile/page';
import { ApiError } from '@/lib/api';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  usePathname: jest.fn(() => '/profile'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

function mockRoute(plan: Record<string, unknown>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    const key = Object.keys(plan).find((k) => path.includes(k));
    if (!key) throw new Error(`Unexpected request to ${path}`);
    const value = plan[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Profile Page', () => {
  it('offers to set up MFA when it is currently off', async () => {
    mockRoute({ '/auth/mfa-status': { enabled: false } });
    render(<ProfilePage />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Set up two-factor authentication' }),
      ).toBeInTheDocument(),
    );
  });

  it('offers to turn MFA off when it is currently on', async () => {
    mockRoute({ '/auth/mfa-status': { enabled: true } });
    render(<ProfilePage />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off two-factor authentication' }),
      ).toBeInTheDocument(),
    );
  });

  it('walks through enrollment: setup shows the QR code and secret, verify enables MFA', async () => {
    mockRoute({
      '/auth/mfa-status': { enabled: false },
      '/auth/mfa-setup': { secretCode: 'SECRET123', otpauthUrl: 'otpauth://totp/BRANCH:a@b.com?secret=SECRET123&issuer=BRANCH' },
      '/auth/mfa-verify': { message: 'MFA enabled' },
    });
    render(<ProfilePage />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Set up two-factor authentication' }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set up two-factor authentication' }),
    );

    await waitFor(() => expect(screen.getByText('SECRET123')).toBeInTheDocument());
    expect(screen.getByAltText('MFA QR code')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/png'),
    );

    await userEvent.type(screen.getByPlaceholderText('123456'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/auth/mfa-verify',
        expect.objectContaining({ body: JSON.stringify({ code: '654321' }) }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off two-factor authentication' }),
      ).toBeInTheDocument(),
    );
  });

  it('shows an inline error for a wrong verification code', async () => {
    mockRoute({
      '/auth/mfa-status': { enabled: false },
      '/auth/mfa-setup': { secretCode: 'SECRET123', otpauthUrl: 'otpauth://totp/x' },
      '/auth/mfa-verify': new ApiError('Invalid verification code', 400),
    });
    render(<ProfilePage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Set up two-factor authentication' }),
    );
    await waitFor(() => expect(screen.getByText('SECRET123')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('123456'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));

    await waitFor(() =>
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument(),
    );
    // Still mid-enrollment: verify failing must not silently flip to "enabled".
    expect(
      screen.queryByRole('button', { name: 'Turn off two-factor authentication' }),
    ).not.toBeInTheDocument();
  });

  it('disables MFA', async () => {
    mockRoute({
      '/auth/mfa-status': { enabled: true },
      '/auth/mfa-disable': { message: 'MFA disabled' },
    });
    render(<ProfilePage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn off two-factor authentication' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Set up two-factor authentication' }),
      ).toBeInTheDocument(),
    );
  });
});
