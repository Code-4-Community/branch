import { apiFetch } from '@/lib/api';

function mockFetch(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: 'Bad Request',
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('apiFetch', () => {
  it('calls fetch with the base URL prepended to the path', async () => {
    mockFetch({ id: 1 });
    await apiFetch('/auth/login', { method: 'POST', body: '{}' });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toMatch(/\/auth\/login$/);
  });

  it('adds Authorization header when token is provided', async () => {
    mockFetch({ ok: true });
    await apiFetch('/auth/logout', { method: 'POST', token: 'my-token' });
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-token');
  });

  it('does not add Authorization header when no token is given', async () => {
    mockFetch({ ok: true });
    await apiFetch('/auth/health');
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('returns parsed JSON on success', async () => {
    mockFetch({ userId: 42 });
    const result = await apiFetch<{ userId: number }>('/users/me');
    expect(result).toEqual({ userId: 42 });
  });

  it('throws with the message from the error body on non-ok response', async () => {
    mockFetch({ message: 'Invalid credentials' }, false, 401);
    await expect(apiFetch('/auth/login')).rejects.toThrow('Invalid credentials');
  });

  it('falls back to statusText when error body has no message', async () => {
    mockFetch({}, false, 400);
    await expect(apiFetch('/auth/login')).rejects.toThrow('Bad Request');
  });
});
