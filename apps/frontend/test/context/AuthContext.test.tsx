import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal JWT whose payload contains the given claims. */
function makeIdToken(claims: Record<string, string>) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
}

const TEST_TOKENS = {
  AccessToken: 'test-access-token',
  IdToken: makeIdToken({ sub: 'sub-123', email: 'jane@example.com', name: 'Jane' }),
  RefreshToken: 'test-refresh-token',
};

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    statusText: 'Unauthorized',
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

describe('AuthProvider / useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    // suppress expected console.error from React
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
  });

  it('starts with no user and finishes loading', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('restores user from localStorage on mount', async () => {
    localStorage.setItem('branch_id_token', TEST_TOKENS.IdToken);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toMatchObject({ sub: 'sub-123', email: 'jane@example.com', name: 'Jane' });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login stores tokens and sets user state', async () => {
    mockFetch(TEST_TOKENS);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('jane@example.com', 'password123');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({ email: 'jane@example.com' });
    expect(localStorage.getItem('branch_access_token')).toBe('test-access-token');
    expect(localStorage.getItem('branch_refresh_token')).toBe('test-refresh-token');
  });

  it('getAccessToken returns the stored access token', async () => {
    mockFetch(TEST_TOKENS);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('jane@example.com', 'password123');
    });

    expect(result.current.getAccessToken()).toBe('test-access-token');
  });

  it('logout clears user state and localStorage', async () => {
    localStorage.setItem('branch_access_token', 'test-access-token');
    localStorage.setItem('branch_id_token', TEST_TOKENS.IdToken);
    localStorage.setItem('branch_refresh_token', 'test-refresh-token');
    mockFetch({ success: true });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('branch_access_token')).toBeNull();
  });

  it('logout still clears state even if the server call fails', async () => {
    localStorage.setItem('branch_access_token', 'test-access-token');
    localStorage.setItem('branch_id_token', TEST_TOKENS.IdToken);
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('branch_access_token')).toBeNull();
  });

  it('login throws on invalid credentials', async () => {
    mockFetch({ message: 'Invalid credentials' }, false);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('bad@example.com', 'wrong');
      }),
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
  });
});
