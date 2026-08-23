import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/lib/authTokens';
import { __resetRefreshStateForTests, onSessionExpired } from '@/lib/authClient';
import { TestQueryProvider } from '../utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a JWT-shaped string whose payload contains the given claims. */
function makeToken(claims: Record<string, unknown>) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
}

/** An access token that expires `seconds` from now. */
function accessTokenExpiringIn(seconds: number) {
  return makeToken({ sub: 'sub-123', exp: Math.floor(Date.now() / 1000) + seconds });
}

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

const TOKENS = {
  AccessToken: accessTokenExpiringIn(3600),
  IdToken: makeToken({ sub: 'sub-123', email: 'jane@example.com' }),
  RefreshToken: 'test-refresh-token',
};

interface RouteResponse {
  status?: number;
  body?: unknown;
}

/** Routes fetch by URL substring so a test can stub several endpoints at once. */
function mockRoutes(routes: Record<string, RouteResponse>) {
  const fetchMock = jest.fn(async (url: string) => {
    const match = Object.keys(routes).find((key) => url.includes(key));
    const { status = 200, body = {} } = match ? routes[match] : { status: 404, body: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'Error',
      json: async () => body,
    } as unknown as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function seedTokens(access = TOKENS.AccessToken) {
  localStorage.setItem(STORAGE_KEYS.ACCESS, access);
  localStorage.setItem(STORAGE_KEYS.ID, TOKENS.IdToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH, TOKENS.RefreshToken);
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TestQueryProvider>
    <AuthProvider>{children}</AuthProvider>
  </TestQueryProvider>
);

async function renderAuth() {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  localStorage.clear();
  __resetRefreshStateForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider / useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
  });

  describe('session bootstrap', () => {
    it('makes no network call and settles unauthenticated when no tokens are stored', async () => {
      const fetchMock = mockRoutes({});

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('restores the session from GET /auth/me when tokens are present', async () => {
      seedTokens();
      mockRoutes({ '/auth/me': { body: { ...ME, isAdmin: true } } });

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.name).toBe('Jane Doe');
      expect(result.current.isAdmin).toBe(true);
    });

    it('clears tokens and stays signed out when /auth/me and refresh both fail', async () => {
      seedTokens();
      mockRoutes({
        '/auth/me': { status: 401, body: { message: 'Authentication required' } },
        '/auth/refresh': { status: 401, body: { message: 'expired' } },
      });

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
    });

    it('takes isAdmin from /auth/me, never from a token claim', async () => {
      // The ID token lies; the server is the only authority. is_admin lives in
      // Postgres and is not a JWT claim, so decoding could never produce it.
      localStorage.setItem(STORAGE_KEYS.ACCESS, accessTokenExpiringIn(3600));
      localStorage.setItem(
        STORAGE_KEYS.ID,
        makeToken({ sub: 'sub-123', is_admin: true, 'cognito:groups': ['Admins'] }),
      );
      localStorage.setItem(STORAGE_KEYS.REFRESH, 'r');
      mockRoutes({ '/auth/me': { body: { ...ME, isAdmin: false } } });

      const { result } = await renderAuth();

      expect(result.current.isAdmin).toBe(false);
    });
  });

  describe('login', () => {
    it('stores tokens and loads the user on success', async () => {
      mockRoutes({ '/auth/login': { body: TOKENS }, '/auth/me': { body: ME } });

      const { result } = await renderAuth();
      await act(async () => {
        const outcome = await result.current.login('jane@example.com', 'pw');
        expect(outcome).toEqual({ status: 'authenticated' });
      });

      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBe(TOKENS.AccessToken);
      expect(localStorage.getItem(STORAGE_KEYS.REFRESH)).toBe(TOKENS.RefreshToken);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('returns a challenge without writing anything to storage', async () => {
      // Regression guard: this used to persist `undefined` for every token —
      // literally the string "undefined" — and report success.
      mockRoutes({
        '/auth/login': {
          body: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'sess-1' },
        },
      });

      const { result } = await renderAuth();
      await act(async () => {
        const outcome = await result.current.login('jane@example.com', 'pw');
        expect(outcome).toEqual({
          status: 'challenge',
          challengeName: 'NEW_PASSWORD_REQUIRED',
          session: 'sess-1',
          email: 'jane@example.com',
        });
      });

      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('rejects a token-less success response instead of half-authenticating', async () => {
      mockRoutes({ '/auth/login': { body: {} } });

      const { result } = await renderAuth();
      await act(async () => {
        await expect(result.current.login('jane@example.com', 'pw')).rejects.toThrow(
          'Login response did not include tokens',
        );
      });

      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('rejects a challenge that arrives without a session', async () => {
      mockRoutes({ '/auth/login': { body: { ChallengeName: 'SMS_MFA' } } });

      const { result } = await renderAuth();
      await act(async () => {
        await expect(result.current.login('jane@example.com', 'pw')).rejects.toThrow(
          'Login challenge returned without a session',
        );
      });
    });

    it('clears tokens when /auth/me fails right after signing in', async () => {
      mockRoutes({
        '/auth/login': { body: TOKENS },
        '/auth/me': { status: 500, body: { message: 'boom' } },
        '/auth/refresh': { status: 401, body: {} },
      });

      const { result } = await renderAuth();
      await act(async () => {
        await expect(result.current.login('jane@example.com', 'pw')).rejects.toThrow(
          /could not load your profile/i,
        );
      });

      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('surfaces the server message on bad credentials', async () => {
      mockRoutes({ '/auth/login': { status: 401, body: { message: 'Invalid email or password' } } });

      const { result } = await renderAuth();
      await act(async () => {
        await expect(result.current.login('jane@example.com', 'nope')).rejects.toThrow(
          'Invalid email or password',
        );
      });
    });
  });

  describe('respondToChallenge', () => {
    it('completes NEW_PASSWORD_REQUIRED and signs the user in', async () => {
      mockRoutes({ '/auth/respond-challenge': { body: TOKENS }, '/auth/me': { body: ME } });

      const { result } = await renderAuth();
      await act(async () => {
        const outcome = await result.current.respondToChallenge({
          challengeName: 'NEW_PASSWORD_REQUIRED',
          session: 'sess-1',
          email: 'jane@example.com',
          newPassword: 'NewPassword123!',
        });
        expect(outcome).toEqual({ status: 'authenticated' });
      });

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('returns the next challenge when Cognito chains one', async () => {
      mockRoutes({
        '/auth/respond-challenge': {
          body: { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'sess-2' },
        },
      });

      const { result } = await renderAuth();
      await act(async () => {
        const outcome = await result.current.respondToChallenge({
          challengeName: 'NEW_PASSWORD_REQUIRED',
          session: 'sess-1',
          email: 'jane@example.com',
          newPassword: 'NewPassword123!',
        });
        expect(outcome).toMatchObject({
          status: 'challenge',
          challengeName: 'SOFTWARE_TOKEN_MFA',
        });
      });
    });
  });

  describe('logout', () => {
    it('clears state and storage', async () => {
      seedTokens();
      mockRoutes({ '/auth/me': { body: ME }, '/auth/logout': { body: { message: 'ok' } } });

      const { result } = await renderAuth();
      expect(result.current.isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.REFRESH)).toBeNull();
    });

    it('clears state even when the server call fails', async () => {
      seedTokens();
      mockRoutes({
        '/auth/me': { body: ME },
        '/auth/logout': { status: 500, body: { message: 'boom' } },
      });

      const { result } = await renderAuth();
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
    });
  });

  describe('session lifetime', () => {
    it('signs the user out when another module ends the session', async () => {
      seedTokens();
      mockRoutes({ '/auth/me': { body: ME } });

      const { result } = await renderAuth();
      expect(result.current.isAuthenticated).toBe(true);

      // Simulates a background request hitting an unrecoverable 401.
      await act(async () => {
        const { endSession } = await import('@/lib/authClient');
        endSession();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('subscribes exactly one session-expiry listener', async () => {
      seedTokens();
      mockRoutes({ '/auth/me': { body: ME } });

      await renderAuth();

      let listenerCount = 0;
      // onSessionExpired returns an unsubscribe; adding one more and firing
      // endSession proves the registry is live rather than counting internals.
      const unsubscribe = onSessionExpired(() => {
        listenerCount += 1;
      });
      const { endSession } = await import('@/lib/authClient');
      act(() => endSession());
      unsubscribe();

      expect(listenerCount).toBe(1);
    });

    it('refreshes the access token before it expires', async () => {
      jest.useFakeTimers();
      seedTokens(accessTokenExpiringIn(300)); // 5 minutes out
      const fetchMock = mockRoutes({
        '/auth/me': { body: ME },
        '/auth/refresh': {
          body: { AccessToken: accessTokenExpiringIn(3600), IdToken: TOKENS.IdToken },
        },
      });

      const view = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      expect(view.result.current.isAuthenticated).toBe(true);

      // Scheduled 2 minutes before expiry, i.e. ~3 minutes from now.
      await act(async () => {
        jest.advanceTimersByTime(4 * 60 * 1000);
      });

      const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/auth/refresh'),
      );
      expect(refreshCalls).toHaveLength(1);
      expect(view.result.current.isAuthenticated).toBe(true);
    });
  });
});
