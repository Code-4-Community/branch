import { render, screen, waitFor, within } from '../utils';
import userEvent from '@testing-library/user-event';
import ProfilePage from '@/app/profile/page';
import { ApiError } from '@/lib/api';
import { session, subjectFor } from '../rbac';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

const SUBJECT = subjectFor({ userId: 7 });

// The session comes from the shared `session()` helper rather than a hand-rolled
// object: components ask @branch/rbac whether the subject may act, so a mock
// missing `subject` makes Header throw on `directorProjectIds`. `reloadUser` is
// still a local spy, which is what the save test asserts on.
const mockReloadUser = jest.fn();
const mockSession = { ...session({ subject: SUBJECT }), reloadUser: mockReloadUser };

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => mockSession,
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  usePathname: jest.fn(() => '/profile'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

const USER_BODY = {
  body: {
    userId: 7,
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    isAdmin: false,
    profile_image: null,
    created_at: '2024-03-04T00:00:00.000Z',
  },
};

const PROJECTS = [
  {
    project_id: 1,
    name: 'Well Drilling',
    description: '',
    total_budget: '100000',
    start_date: '2024-01-01',
    end_date: '2030-01-01',
    currency: 'USD',
    created_at: null,
    total_spent: 30000,
    member_count: 3,
    is_active: true,
  },
];

/**
 * Keys are matched as substrings in insertion order, so the more specific paths
 * must come first: `/users/7` would otherwise swallow `/users/7/...`.
 */
function mockRoute(plan: Record<string, unknown>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    const key = Object.keys(plan).find((k) => path.includes(k));
    if (!key) throw new Error(`Unexpected request to ${path}`);
    const value = plan[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

function mockLoadedPage(extra: Record<string, unknown> = {}) {
  mockRoute({
    ...extra,
    '/auth/mfa-status': { enabled: false },
    '/projects': PROJECTS,
    '/users/7': USER_BODY,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Profile Page', () => {
  it('shows the account details from the API', async () => {
    mockLoadedPage();
    render(<ProfilePage />);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Ada Lovelace' });
    // Scoped to the details section: the navbar and the page header both render
    // the signed-in email as well.
    const details = within(heading.closest('section')!);
    expect(details.getByText('ada@example.com')).toBeInTheDocument();
    expect(details.getByText('Manage your account details and preferences')).toBeInTheDocument();
    expect(details.getByText(/Date Joined:/)).toHaveTextContent('Mar 4, 2024');
  });

  it('lists the projects the user belongs to', async () => {
    mockLoadedPage();
    render(<ProfilePage />);

    expect(await screen.findByText('Well Drilling')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Projects' })).toBeInTheDocument();
  });

  it('saves an edited name and refreshes the auth context', async () => {
    mockLoadedPage();
    render(<ProfilePage />);
    await screen.findByRole('heading', { level: 2, name: 'Ada Lovelace' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));

    const nameInput = screen.getByDisplayValue('Ada Lovelace');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Ada L');

    // Email is the Cognito username: shown for context, never submittable.
    expect(screen.getByDisplayValue('ada@example.com')).toBeDisabled();

    mockRoute({
      '/auth/mfa-status': { enabled: false },
      '/projects': PROJECTS,
      '/users/7': {
        body: {
          email: 'ada@example.com',
          name: 'Ada L',
          isAdmin: false,
          profileImage: null,
          created_at: '2024-03-04T00:00:00.000Z',
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/users/7',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Ada L' }),
        }),
      ),
    );
    await waitFor(() => expect(mockReloadUser).toHaveBeenCalled());
  });

  it('rejects a name that is too short without calling the API', async () => {
    mockLoadedPage();
    render(<ProfilePage />);
    await screen.findByRole('heading', { level: 2, name: 'Ada Lovelace' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    await userEvent.clear(screen.getByDisplayValue('Ada Lovelace'));
    await userEvent.type(screen.getByLabelText(/Name/), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/users/7',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends a password reset email', async () => {
    mockLoadedPage({ '/auth/forgot-password': { message: 'sent' } });
    render(<ProfilePage />);
    await screen.findByRole('heading', { level: 2, name: 'Ada Lovelace' });

    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Email' }));

    expect(
      await screen.findByText('We sent a reset link to ada@example.com.'),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure instead of a blank page', async () => {
    mockRoute({
      '/auth/mfa-status': { enabled: false },
      '/projects': PROJECTS,
      '/users/7': new ApiError('Boom', 500),
    });
    render(<ProfilePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });

  describe('two-factor', () => {
    it('enrolls through the modal and reflects the new state on the page', async () => {
      mockLoadedPage({
        '/auth/mfa-setup': {
          secretCode: 'SECRET123',
          otpauthUrl: 'otpauth://totp/BRANCH:ada@example.com?secret=SECRET123&issuer=BRANCH',
        },
        '/auth/mfa-verify': { message: 'MFA enabled' },
      });
      render(<ProfilePage />);

      await userEvent.click(await screen.findByRole('button', { name: 'Set Up Two-Factor' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Set Up' }));

      expect(await screen.findByText('SECRET123')).toBeInTheDocument();
      expect(screen.getByAltText('Two-factor authentication QR code')).toHaveAttribute(
        'src',
        expect.stringContaining('data:image/png'),
      );

      await userEvent.type(screen.getByPlaceholderText('123456'), '654321');
      await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/auth/mfa-verify',
          expect.objectContaining({ body: JSON.stringify({ code: '654321' }) }),
        ),
      );
      expect(
        await screen.findByRole('button', { name: 'Manage Two-Factor' }),
      ).toBeInTheDocument();
    });

    it('keeps the user mid-enrollment when the code is wrong', async () => {
      mockLoadedPage({
        '/auth/mfa-setup': { secretCode: 'SECRET123', otpauthUrl: 'otpauth://totp/x' },
        '/auth/mfa-verify': new ApiError('Invalid verification code', 400),
      });
      render(<ProfilePage />);

      await userEvent.click(await screen.findByRole('button', { name: 'Set Up Two-Factor' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Set Up' }));
      await screen.findByText('SECRET123');

      await userEvent.type(screen.getByPlaceholderText('123456'), '000000');
      await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

      expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
      // A failed verify must not flip the page to "on".
      expect(
        screen.queryByRole('button', { name: 'Manage Two-Factor' }),
      ).not.toBeInTheDocument();
    });

    it('turns two-factor off', async () => {
      mockRoute({
        '/auth/mfa-status': { enabled: true },
        '/auth/mfa-disable': { message: 'MFA disabled' },
        '/projects': PROJECTS,
        '/users/7': USER_BODY,
      });
      render(<ProfilePage />);

      await userEvent.click(await screen.findByRole('button', { name: 'Manage Two-Factor' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Turn Off' }));

      expect(
        await screen.findByRole('button', { name: 'Set Up Two-Factor' }),
      ).toBeInTheDocument();
    });
  });
});
