// Uses renderWithLiveAuth: this suite is specifically about Header reflecting a
// session that AuthProvider resolved from token storage and GET /auth/me, so it
// needs the real provider rather than the static subject the default render
// installs.
import { renderWithLiveAuth as render, screen, waitFor } from '../utils';
import '@testing-library/jest-dom';
import Header from '../../src/app/components/Header';
import { STORAGE_KEYS } from '@/lib/authTokens';
import { __resetRefreshStateForTests } from '@/lib/authClient';

// `rbac` is not optional: AuthProvider rejects a /auth/me payload without a
// subject rather than signing the user in and then denying them everything.
const ME = {
  userId: 7,
  cognitoSub: 'sub-123',
  email: 'jane@example.com',
  name: 'Jane Doe',
  isAdmin: false,
  rbac: { userId: 7, isAdmin: false, memberProjectIds: [1], directorProjectIds: [] },
};

function makeToken(claims: Record<string, unknown>) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
}

/** Seeds tokens and stubs GET /auth/me so AuthProvider resolves a session. */
function signIn(me: Record<string, unknown> = ME) {
  localStorage.setItem(
    STORAGE_KEYS.ACCESS,
    makeToken({ sub: 'sub-123', exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  localStorage.setItem(STORAGE_KEYS.ID, makeToken({ sub: 'sub-123' }));
  localStorage.setItem(STORAGE_KEYS.REFRESH, 'refresh-token');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => me,
  } as unknown as Response);
}

beforeEach(() => {
  localStorage.clear();
  __resetRefreshStateForTests();
});

afterEach(() => jest.restoreAllMocks());

describe('Header Component', () => {
  it('renders the default title when no props are provided', () => {
    render(<Header />);
    expect(screen.getByText(/BRANCH Accounting Platform/i)).toBeInTheDocument();
  });

  it('renders a custom title when the text prop is provided', () => {
    render(<Header text="Custom Title" />);
    expect(screen.getByText(/Custom Title/i)).toBeInTheDocument();
  });

  it('renders a custom icon when the icon prop is provided', () => {
    render(<Header icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('falls back to the placeholder avatar when signed out', () => {
    render(<Header />);
    expect(screen.getByAltText('Profile Icon')).toBeInTheDocument();
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('shows the signed-in user name and email', async () => {
    signIn();
    render(<Header />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    // The placeholder is replaced by real identity.
    expect(screen.queryByAltText('Profile Icon')).not.toBeInTheDocument();
  });

  it('shows an Admin badge only for admins', async () => {
    signIn({ ...ME, isAdmin: true });
    render(<Header />);

    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
  });

  it('does not show an Admin badge for a non-admin', async () => {
    signIn({ ...ME, isAdmin: false });
    render(<Header />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});
