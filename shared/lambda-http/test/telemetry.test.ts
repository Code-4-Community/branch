import { ANONYMOUS, RbacSubject } from '@branch/rbac';
import { logger } from '@branch/lambda-telemetry';
import { dispatch } from '../src/dispatch';
import { json } from '../src/response';
import type { RequestAuth, Route } from '../src/types';

jest.mock('@sentry/aws-serverless', () => ({ captureException: jest.fn() }), { virtual: true });

jest.mock('@branch/lambda-telemetry', () => {
  const actual = jest.requireActual('@branch/lambda-telemetry');
  return {
    ...actual,
    flushTelemetry: jest.fn(async () => undefined),
    recordRequest: jest.fn(),
    recordColdStart: jest.fn(),
    recordAuthFailure: jest.fn(),
    recordUnhandledError: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const telemetry = require('@branch/lambda-telemetry') as {
  resetLoggerForTests?: () => void;
  flushTelemetry: jest.Mock;
  recordRequest: jest.Mock;
  recordColdStart: jest.Mock;
  recordAuthFailure: jest.Mock;
  recordUnhandledError: jest.Mock;
};

// Literal segments before `:param` ones — first match wins.
const routes: Route[] = [
  {
    method: 'GET',
    pattern: '/projects/boom',
    access: 'public',
    handler: async () => {
      throw new Error('kaboom');
    },
  },
  {
    method: 'GET',
    pattern: '/projects/:id',
    access: 'authenticated',
    handler: async () => json(200, { ok: true }),
  },
  {
    method: 'PUT',
    pattern: '/projects/:id',
    permission: 'project:update',
    handler: async () => json(200, { ok: true }),
  },
];

const subject = (userId: number, isAdmin: boolean): RbacSubject => ({
  userId,
  isAdmin,
  memberProjectIds: [],
  directorProjectIds: [],
});

const authed =
  (userId: number, isAdmin = false) =>
  async (): Promise<RequestAuth> => ({
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
  requestContext: { http: { method }, requestId: 'req-abc' },
});

let logged: Record<string, unknown>[];

beforeEach(() => {
  jest.clearAllMocks();
  // Jest defaults the level to `error`; the access log is info.
  process.env.LOG_LEVEL = 'info';
  telemetry.resetLoggerForTests?.();
  logged = [];
  const capture = (line: unknown) => {
    try {
      logged.push(JSON.parse(String(line)));
    } catch {
      logged.push({ raw: String(line) });
    }
  };
  jest.spyOn(console, 'log').mockImplementation(capture);
  jest.spyOn(console, 'warn').mockImplementation(capture);
  jest.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => jest.restoreAllMocks());

describe('request metrics', () => {
  it('records the route pattern, not the concrete path', async () => {
    await dispatch(event('GET', '/projects/42'), opts());

    expect(telemetry.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/projects/:id', statusCode: 200 }),
    );
    const [{ route }] = telemetry.recordRequest.mock.calls[0];
    expect(route).not.toContain('42');
  });

  it('labels an unmatched path as "unmatched" rather than echoing it', async () => {
    await dispatch(event('GET', '/projects/7/nope'), opts());

    expect(telemetry.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'unmatched', statusCode: 404 }),
    );
  });

  it('reports a duration', async () => {
    await dispatch(event('GET', '/projects/42'), opts());

    const [{ durationMs }] = telemetry.recordRequest.mock.calls[0];
    expect(typeof durationMs).toBe('number');
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('counts the first invocation as a cold start and later ones not', async () => {
    await dispatch(event('GET', '/projects/42'), opts());
    const afterFirst = telemetry.recordColdStart.mock.calls.length;

    await dispatch(event('GET', '/projects/42'), opts());
    expect(telemetry.recordColdStart.mock.calls.length).toBe(afterFirst);
  });
});

describe('auth failure metrics', () => {
  it('counts a 401 as unauthenticated', async () => {
    const res = await dispatch(event('GET', '/projects/42'), opts(anonymous));

    expect(res.statusCode).toBe(401);
    expect(telemetry.recordAuthFailure).toHaveBeenCalledWith(
      'GET',
      '/projects/:id',
      'unauthenticated',
    );
  });

  it('counts a 403 as forbidden', async () => {
    const res = await dispatch(event('PUT', '/projects/42'), opts(authed(9, false)));

    expect(res.statusCode).toBe(403);
    expect(telemetry.recordAuthFailure).toHaveBeenCalledWith('PUT', '/projects/:id', 'forbidden');
  });
});

describe('unhandled errors', () => {
  it('counts the throw and still answers 500', async () => {
    const res = await dispatch(event('GET', '/projects/boom'), opts());

    expect(res.statusCode).toBe(500);
    expect(telemetry.recordUnhandledError).toHaveBeenCalledWith('GET', '/projects/boom');
  });
});

describe('access log', () => {
  it('emits one line carrying the request id, route, status and caller', async () => {
    await dispatch(event('GET', '/projects/42'), opts(authed(7, true)));

    const line = logged.find((entry) => entry.message === 'Request served');
    expect(line).toMatchObject({
      level: 'info',
      service: 'projects',
      'http.request.method': 'GET',
      'http.route': '/projects/:id',
      'url.path': '/projects/42',
      'http.response.status_code': 200,
      'aws.request_id': 'req-abc',
      'enduser.id': '7',
    });
  });

  it('keeps health checks at debug so an idle stack stays quiet', async () => {
    await dispatch(event('GET', '/projects/health'), opts());

    expect(logged.find((entry) => entry.message === 'Request served')).toBeUndefined();
    expect(telemetry.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/projects/health', statusCode: 200 }),
    );
  });

  it('logs a 500 at error level', async () => {
    await dispatch(event('GET', '/projects/boom'), opts());

    const line = logged.find((entry) => entry.message === 'Request served');
    expect(line).toMatchObject({ level: 'error', 'http.response.status_code': 500 });
  });

  it('carries the enclosing request into a controller log line', async () => {
    const chatty: Route[] = [
      {
        method: 'GET',
        pattern: '/projects/chatty',
        access: 'public',
        handler: async () => {
          logger.info('did a thing', { thing: 1 });
          return json(200, {});
        },
      },
    ];

    await dispatch(event('GET', '/projects/chatty'), { prefix: 'projects', routes: chatty });

    expect(logged.find((entry) => entry.message === 'did a thing')).toMatchObject({
      thing: 1,
      'http.route': '/projects/chatty',
      'aws.request_id': 'req-abc',
    });
  });
});

describe('flushing', () => {
  it('flushes before returning, because Lambda freezes on return', async () => {
    await dispatch(event('GET', '/projects/42'), opts());

    expect(telemetry.flushTelemetry).toHaveBeenCalledTimes(1);
  });

  it('still flushes when the handler threw', async () => {
    await dispatch(event('GET', '/projects/boom'), opts());

    expect(telemetry.flushTelemetry).toHaveBeenCalledTimes(1);
  });
});
