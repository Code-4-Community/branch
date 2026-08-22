import type { AuthContext } from '@branch/lambda-auth';
import { createAuthGuard, requireAuth } from '../src/authz';
import { parseBody } from '../src/body';

const anon: AuthContext = { isAuthenticated: false };
const user = (userId: number, isAdmin = false): AuthContext => ({
  isAuthenticated: true,
  user: { userId, isAdmin } as AuthContext['user'],
});

const body = (res: { body: string }) => JSON.parse(res.body);

describe('requireAuth', () => {
  it('allows a permitted request', () => {
    expect(requireAuth(user(1), 'AUTHENTICATED')).toBeUndefined();
  });

  it('401s an unauthenticated caller', () => {
    const res = requireAuth(anon, 'AUTHENTICATED')!;
    expect(res.statusCode).toBe(401);
    expect(body(res).message).toBe('Authentication required');
  });

  it('403s an authenticated caller who lacks access', () => {
    const res = requireAuth(user(1), 'ADMIN')!;
    expect(res.statusCode).toBe(403);
    expect(body(res).message).toBe('Admin access required');
  });

  it('passes the resource owner through for SELF', () => {
    expect(requireAuth(user(5), 'SELF', 5)).toBeUndefined();
    expect(requireAuth(user(5), 'SELF', 6)!.statusCode).toBe(403);
  });
});

describe('createAuthGuard', () => {
  it('returns the context when allowed', async () => {
    const guard = createAuthGuard(async () => user(3, true));
    const result = await guard({}, 'ADMIN');
    expect(result.response).toBeUndefined();
    expect(result.ctx?.user?.userId).toBe(3);
  });

  it('returns a response when denied', async () => {
    const guard = createAuthGuard(async () => anon);
    const result = await guard({}, 'ADMIN');
    expect(result.ctx).toBeUndefined();
    expect(result.response?.statusCode).toBe(401);
  });

  it('defaults to AUTHENTICATED', async () => {
    const guard = createAuthGuard(async () => user(1));
    expect((await guard({})).response).toBeUndefined();
  });
});

describe('parseBody', () => {
  it('parses JSON', () => {
    expect(parseBody({ body: '{"a":1}' })).toEqual({ a: 1 });
  });

  it('returns an empty object for an absent body', () => {
    expect(parseBody({})).toEqual({});
  });

  it('returns null for malformed JSON', () => {
    expect(parseBody({ body: '{' })).toBeNull();
  });
});
