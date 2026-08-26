import { ANONYMOUS, RbacSubject } from '@branch/rbac';
import { dispatch } from '../src/dispatch';
import { json } from '../src/response';
import type { RequestAuth, Route } from '../src/types';

jest.mock('@sentry/aws-serverless', () => ({ captureException: jest.fn() }), {
  virtual: true,
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sentry = require('@sentry/aws-serverless') as { captureException: jest.Mock };

const ok = (label: string): Route['handler'] => async (ctx) =>
  json(200, { label, params: ctx.params, path: ctx.path, subject: ctx.auth.subject });

const routes: Route[] = [
  { method: 'GET', pattern: '/projects', access: 'authenticated', handler: ok('list') },
  {
    method: 'GET',
    pattern: '/projects/dashboard',
    permission: 'dashboard:view',
    handler: ok('dashboard'),
  },
  { method: 'GET', pattern: '/projects/:id', access: 'authenticated', handler: ok('get-one') },
  { method: 'PUT', pattern: '/projects/:id', permission: 'project:update', handler: ok('update') },
];

const subject = (userId: number, isAdmin = false): RbacSubject => ({
  userId,
  isAdmin,
  memberProjectIds: [],
  directorProjectIds: [],
});

const authed = (userId: number, isAdmin = false) => async (): Promise<RequestAuth> => ({
  context: { isAuthenticated: true, user: { cognitoSub: 'x', userId, isAdmin } },
  subject: subject(userId, isAdmin),
});

const anonymous = async (): Promise<RequestAuth> => ({
  context: { isAuthenticated: false },
  subject: ANONYMOUS,
});

const opts = (resolveAuth = authed(1, true)) => ({ prefix: 'projects', routes, resolveAuth });

const event = (method: string, rawPath: string) => ({
  rawPath,
  requestContext: { http: { method } },
});

const body = (res: { body: string }) => JSON.parse(res.body);

describe('dispatch routing', () => {
  it('routes the full prefixed path that API Gateway forwards', async () => {
    const res = await dispatch(event('GET', '/projects'), opts());
    expect(res.statusCode).toBe(200);
    expect(body(res).label).toBe('list');
  });

  it('routes the prefix-stripped path the dev-server forwards', async () => {
    const res = await dispatch(event('GET', '/'), opts());
    expect(body(res).label).toBe('list');
  });

  it('canonicalizes a stripped sub-path back under the prefix', async () => {
    const res = await dispatch(event('GET', '/7'), opts());
    expect(body(res)).toMatchObject({ label: 'get-one', params: { id: '7' }, path: '/projects/7' });
  });

  it('honours route order, so a literal wins over a param pattern', async () => {
    const res = await dispatch(event('GET', '/projects/dashboard'), opts());
    expect(body(res).label).toBe('dashboard');
  });

  it('discriminates on method', async () => {
    const res = await dispatch(event('PUT', '/projects/7'), opts());
    expect(body(res).label).toBe('update');
  });

  it('ignores a trailing slash', async () => {
    const res = await dispatch(event('GET', '/projects/'), opts());
    expect(body(res).label).toBe('list');
  });

  it('accepts the API Gateway event shape (path + httpMethod)', async () => {
    const res = await dispatch({ path: '/projects/7', httpMethod: 'get' }, opts());
    expect(body(res).label).toBe('get-one');
  });

  it('answers OPTIONS preflight with 200 and CORS headers, without authenticating', async () => {
    const resolveAuth = jest.fn(anonymous);
    const res = await dispatch(event('OPTIONS', '/projects/7'), {
      prefix: 'projects',
      routes,
      resolveAuth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(resolveAuth).not.toHaveBeenCalled();
  });

  it('serves health under both path shapes without a session', async () => {
    for (const path of ['/projects/health', '/health']) {
      const res = await dispatch(event('GET', path), {
        prefix: 'projects',
        routes,
        resolveAuth: anonymous,
      });
      expect(res.statusCode).toBe(200);
      expect(body(res).ok).toBe(true);
    }
  });

  it('404s an unmatched path', async () => {
    const res = await dispatch(event('GET', '/projects/7/nope'), opts());
    expect(res.statusCode).toBe(404);
    expect(body(res)).toMatchObject({ message: 'Not Found', path: '/projects/7/nope' });
  });

  it('500s when a handler throws, reports it, and does not leak the error', async () => {
    Sentry.captureException.mockClear();
    const boom: Route[] = [
      {
        method: 'GET',
        pattern: '/projects',
        access: 'authenticated',
        handler: async () => {
          throw new Error('secret detail');
        },
      },
    ];
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await dispatch(event('GET', '/projects'), {
      prefix: 'projects',
      routes: boom,
      resolveAuth: authed(1),
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
    // The Sentry layer only records uncaught throws; this one was caught.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][0]).toMatchObject({
      message: 'secret detail',
    });
    expect(Sentry.captureException.mock.calls[0][1]).toEqual({
      extra: { method: 'GET', path: '/projects' },
    });
    spy.mockRestore();
  });
});

describe('dispatch authorization', () => {
  it('401s a guarded route for an anonymous caller', async () => {
    const res = await dispatch(event('GET', '/projects'), {
      prefix: 'projects',
      routes,
      resolveAuth: anonymous,
    });
    expect(res.statusCode).toBe(401);
  });

  it('403s an authenticated caller who fails the route permission', async () => {
    const res = await dispatch(event('GET', '/projects/dashboard'), opts(authed(2, false)));
    expect(res.statusCode).toBe(403);
    expect(body(res).message).toBe('Only administrators can do this');
  });

  it('lets an authenticated non-admin through an access:authenticated route', async () => {
    const res = await dispatch(event('GET', '/projects'), opts(authed(2, false)));
    expect(res.statusCode).toBe(200);
  });

  it('serves a public route without calling resolveAuth', async () => {
    const resolveAuth = jest.fn(anonymous);
    const publicRoutes: Route[] = [
      { method: 'POST', pattern: '/auth/login', access: 'public', handler: ok('login') },
    ];
    const res = await dispatch(event('POST', '/auth/login'), {
      prefix: 'auth',
      routes: publicRoutes,
      resolveAuth,
    });
    expect(res.statusCode).toBe(200);
    expect(body(res).subject).toEqual(ANONYMOUS);
    expect(resolveAuth).not.toHaveBeenCalled();
  });

  it('hands the resolved subject to the controller', async () => {
    const res = await dispatch(event('GET', '/projects'), opts(authed(42, false)));
    expect(body(res).subject.userId).toBe(42);
  });

  it('500s rather than serving a guarded route when resolveAuth is missing', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await dispatch(event('GET', '/projects'), { prefix: 'projects', routes });
    expect(res.statusCode).toBe(500);
    spy.mockRestore();
  });

  it('authenticates once per request, not once per route tried', async () => {
    const resolveAuth = jest.fn(authed(1, true));
    await dispatch(event('PUT', '/projects/7'), { prefix: 'projects', routes, resolveAuth });
    expect(resolveAuth).toHaveBeenCalledTimes(1);
  });
});
