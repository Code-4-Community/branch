import { ApiError } from '@/lib/api';
import {
  __resetRefreshStateForTests,
  authedFetch,
  endSession,
  onSessionExpired,
  refreshSession,
} from '@/lib/authClient';
import { STORAGE_KEYS } from '@/lib/authTokens';

function makeToken(claims: Record<string, unknown>) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`;
}

const VALID_ACCESS = makeToken({ sub: 's', exp: Math.floor(Date.now() / 1000) + 3600 });
const EXPIRED_ACCESS = makeToken({ sub: 's', exp: Math.floor(Date.now() / 1000) - 60 });
const NEW_ACCESS = makeToken({ sub: 's', exp: Math.floor(Date.now() / 1000) + 3600 });

function seed(access = VALID_ACCESS, refresh: string | null = 'refresh-token') {
  localStorage.setItem(STORAGE_KEYS.ACCESS, access);
  localStorage.setItem(STORAGE_KEYS.ID, makeToken({ sub: 's' }));
  if (refresh) localStorage.setItem(STORAGE_KEYS.REFRESH, refresh);
}

interface Reply {
  status?: number;
  body?: unknown;
}

/** Queues per-URL replies; each key can supply a sequence of responses. */
function mockFetch(plan: Record<string, Reply[]>) {
  const cursors: Record<string, number> = {};
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(plan).find((k) => url.includes(k));
    if (!key) throw new Error(`Unexpected fetch to ${url}`);
    const index = Math.min(cursors[key] ?? 0, plan[key].length - 1);
    cursors[key] = (cursors[key] ?? 0) + 1;
    const { status = 200, body = {} } = plan[key][index];
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'Error',
      json: async () => body,
      // Expose the request so tests can assert on the outgoing header.
      __init: init,
    } as unknown as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit;
  return (init.headers as Record<string, string>)['Authorization'];
}

function callsTo(fetchMock: jest.Mock, fragment: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));
}

beforeEach(() => {
  localStorage.clear();
  __resetRefreshStateForTests();
});

afterEach(() => jest.restoreAllMocks());

describe('authedFetch', () => {
  it('attaches the stored access token', async () => {
    seed();
    const fetchMock = mockFetch({ '/projects': [{ body: [] }] });

    await authedFetch('/projects');

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe(`Bearer ${VALID_ACCESS}`);
  });

  it('ends the session immediately when no token is stored', async () => {
    const expired = jest.fn();
    onSessionExpired(expired);
    const fetchMock = mockFetch({ '/projects': [{ body: [] }] });

    await expect(authedFetch('/projects')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(expired).toHaveBeenCalled();
  });

  it('refreshes pre-emptively when the stored token has already expired', async () => {
    seed(EXPIRED_ACCESS);
    const fetchMock = mockFetch({
      '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'id' } }],
      '/projects': [{ body: [] }],
    });

    await authedFetch('/projects');

    // Refresh happens first — no wasted round trip on a guaranteed 401.
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/refresh');
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe(`Bearer ${NEW_ACCESS}`);
  });

  it('refreshes and retries once on a 401, using the new token', async () => {
    seed();
    const fetchMock = mockFetch({
      '/projects': [{ status: 401, body: { message: 'expired' } }, { body: [] }],
      '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'id' } }],
    });

    await expect(authedFetch('/projects')).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authHeaderOf(callsTo(fetchMock, '/projects')[1])).toBe(`Bearer ${NEW_ACCESS}`);
  });

  it('does not retry twice when the retry also 401s', async () => {
    seed();
    const fetchMock = mockFetch({
      '/projects': [{ status: 401, body: {} }, { status: 401, body: {} }],
      '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'id' } }],
    });

    await expect(authedFetch('/projects')).rejects.toMatchObject({ status: 401 });

    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(callsTo(fetchMock, '/projects')).toHaveLength(2);
  });

  it('ends the session when the refresh itself fails', async () => {
    seed();
    const expired = jest.fn();
    onSessionExpired(expired);
    mockFetch({
      '/projects': [{ status: 401, body: {} }],
      '/auth/refresh': [{ status: 401, body: {} }],
    });

    await expect(authedFetch('/projects')).rejects.toMatchObject({ status: 401 });

    expect(expired).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
  });

  it('does not attempt a refresh when retryOn401 is false', async () => {
    seed();
    const fetchMock = mockFetch({
      '/auth/logout': [{ status: 401, body: {} }],
      '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'id' } }],
    });

    await expect(
      authedFetch('/auth/logout', { method: 'POST', retryOn401: false }),
    ).rejects.toMatchObject({ status: 401 });

    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(0);
  });

  it('propagates a non-401 error untouched', async () => {
    seed();
    const fetchMock = mockFetch({
      '/projects': [{ status: 500, body: { message: 'boom' } }],
      '/auth/refresh': [{ body: {} }],
    });

    await expect(authedFetch('/projects')).rejects.toThrow('boom');
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(0);
  });

  it('issues exactly one refresh for a burst of concurrent 401s', async () => {
    seed();
    const fetchMock = mockFetch({
      '/projects': [
        { status: 401, body: {} },
        { status: 401, body: {} },
        { status: 401, body: {} },
        { status: 401, body: {} },
        { status: 401, body: {} },
        { body: [] },
      ],
      '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'id' } }],
    });

    await Promise.allSettled(
      Array.from({ length: 5 }, () => authedFetch('/projects')),
    );

    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
  });
});

describe('refreshSession', () => {
  it('returns false without calling the API when there is no refresh token', async () => {
    seed(VALID_ACCESS, null);
    const fetchMock = mockFetch({ '/auth/refresh': [{ body: {} }] });

    await expect(refreshSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the new tokens without erasing the refresh token', async () => {
    // Cognito does not re-issue a refresh token on REFRESH_TOKEN_AUTH, so the
    // stored one must survive.
    seed();
    mockFetch({ '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS, IdToken: 'new-id' } }] });

    await expect(refreshSession()).resolves.toBe(true);

    expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBe(NEW_ACCESS);
    expect(localStorage.getItem(STORAGE_KEYS.ID)).toBe('new-id');
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH)).toBe('refresh-token');
  });

  it('returns false when the response is missing tokens', async () => {
    seed();
    mockFetch({ '/auth/refresh': [{ body: { AccessToken: NEW_ACCESS } }] });

    await expect(refreshSession()).resolves.toBe(false);
  });
});

describe('endSession', () => {
  it('clears tokens and notifies every listener', () => {
    seed();
    const a = jest.fn();
    const b = jest.fn();
    onSessionExpired(a);
    onSessionExpired(b);

    endSession();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH)).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);
    unsubscribe();

    endSession();

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying the remaining listeners when one throws', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const survivor = jest.fn();
    onSessionExpired(() => {
      throw new Error('listener blew up');
    });
    onSessionExpired(survivor);

    expect(() => endSession()).not.toThrow();
    expect(survivor).toHaveBeenCalled();
  });
});

describe('ApiError', () => {
  it('is an Error, so existing catch blocks keep working', () => {
    const error = new ApiError('nope', 401, { message: 'nope' });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
  });
});
