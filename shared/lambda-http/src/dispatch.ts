import type { APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '@branch/rbac';
import {
  enrichRequestContext,
  flushTelemetry,
  logger,
  recordAuthFailure,
  recordColdStart,
  recordRequest,
  recordUnhandledError,
  runWithRequestContext,
} from '@branch/lambda-telemetry';
import type { RequestContext } from '@branch/lambda-telemetry';
import { json } from './response';
import { matchPattern } from './match';
import { ANONYMOUS_AUTH } from './authz';
import { reportError } from './errors';
import type { DispatchOptions, RequestAuth, Route } from './types';

let firstInvocation = true;

/** Labels are route *patterns*; `/donors/42` would be one series per donor. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * Route a Lambda event to the first matching route and return its response.
 *
 * Canonicalizes the incoming path to the full prefixed shape so a single route
 * table works under both:
 *  - API Gateway `{proxy+}` — delivers the full path, e.g. `/auth/login`.
 *  - the shared dev-server — routes by first segment then strips it, e.g. `/login`
 *    (and `/` for a bare service root).
 *
 * Handles OPTIONS preflight, `/<prefix>/health`, authentication, the route's
 * declared permission, 404 and 500 centrally. A controller that runs has
 * already cleared its route's gate.
 *
 * Also the one place the backend is instrumented: metrics, the access log, and
 * the flush that has to happen before Lambda freezes the container.
 */
export async function dispatch(
  event: any,
  { prefix, routes, resolveAuth }: DispatchOptions,
): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const coldStart = firstInvocation;
  firstInvocation = false;

  const rawPath = String(event?.rawPath || event?.path || '/');
  const method = String(
    event?.requestContext?.http?.method || event?.httpMethod || 'GET',
  ).toUpperCase();

  // Canonicalize to `/<prefix>...` when the prefix was stripped (dev-server).
  const base = `/${prefix}`;
  let path = rawPath.replace(/\/+$/, '') || '/';
  if (path !== base && !path.startsWith(`${base}/`)) {
    path = path === '/' ? base : base + path;
  }

  const context: RequestContext = {
    requestId: event?.requestContext?.requestId,
    service: prefix,
    method,
    path,
    coldStart,
  };

  return runWithRequestContext(context, async () => {
    if (coldStart) recordColdStart();

    let response: APIGatewayProxyResult;
    try {
      response = await route(event, { prefix, routes, resolveAuth }, { base, path, method });
    } catch (err) {
      logger.error('Unhandled error', { error: err });
      recordUnhandledError(method, context.route ?? UNMATCHED_ROUTE);
      // The layer's wrapHandler only records throws, and catching here is what
      // gets API Gateway a JSON 500 instead of a 502 -- so hand it over by hand.
      reportError(err, { method, path });
      response = json(500, { message: 'Internal Server Error' });
    }

    await complete(context, response, startedAt);
    return response;
  });
}

interface Target {
  base: string;
  path: string;
  method: string;
}

async function route(
  event: any,
  { routes, resolveAuth }: DispatchOptions,
  { base, path, method }: Target,
): Promise<APIGatewayProxyResult> {
  if (method === 'OPTIONS') {
    enrichRequestContext({ route: 'preflight' });
    return json(200, {});
  }

  if (path === `${base}/health` && method === 'GET') {
    enrichRequestContext({ route: `${base}/health` });
    return json(200, { ok: true, timestamp: new Date().toISOString() });
  }

  for (const candidate of routes) {
    if (candidate.method.toUpperCase() !== method) continue;
    const params = matchPattern(candidate.pattern, path);
    if (!params) continue;

    enrichRequestContext({ route: candidate.pattern });

    const gate = await enforce(candidate, event, resolveAuth);
    if ('response' in gate) return gate.response;

    enrichRequestContext({ userId: userIdOf(gate.auth) });
    return await candidate.handler({ event, params, method, path, auth: gate.auth });
  }

  enrichRequestContext({ route: UNMATCHED_ROUTE });
  return json(404, { message: 'Not Found', path, method });
}

/** Lambda freezes on return, so a flush that misses here never happens. */
async function complete(
  context: RequestContext,
  response: APIGatewayProxyResult,
  startedAt: number,
): Promise<void> {
  const durationMs = Date.now() - startedAt;
  const statusCode = response.statusCode;
  const route = context.route ?? UNMATCHED_ROUTE;

  recordRequest({ method: context.method, route, statusCode, durationMs });

  // Health checks dominate an idle stack: worth counting, not worth narrating.
  const level = route.endsWith('/health') ? 'debug' : statusCode >= 500 ? 'error' : 'info';
  logger[level]('Request served', {
    'http.response.status_code': statusCode,
    durationMs,
  });

  await flushTelemetry();
}

type Gate = { auth: RequestAuth } | { response: APIGatewayProxyResult };

async function enforce(
  route: Route,
  event: any,
  resolveAuth: DispatchOptions['resolveAuth'],
): Promise<Gate> {
  if (route.access === 'public') return { auth: ANONYMOUS_AUTH };

  // A guarded route in a service that never wired up authentication is a
  // deployment bug, not an anonymous request. 500 rather than serving it.
  if (!resolveAuth) {
    const err = new Error(
      `Route ${route.method} ${route.pattern} is guarded but the service passed no resolveAuth`,
    );
    logger.error(err.message, { error: err });
    reportError(err);
    return { response: json(500, { message: 'Internal Server Error' }) };
  }

  const auth = await resolveAuth(event);
  if (!auth.context.isAuthenticated) {
    recordAuthFailure(route.method.toUpperCase(), route.pattern, 'unauthenticated');
    return { response: json(401, { message: 'Authentication required' }) };
  }

  if (route.permission) {
    const decision = authorize(auth.subject, route.permission);
    if (!decision.allowed) {
      recordAuthFailure(route.method.toUpperCase(), route.pattern, 'forbidden');
      return { response: json(403, { message: decision.reason ?? 'Forbidden' }) };
    }
  }

  return { auth };
}

function userIdOf(auth: RequestAuth): string | undefined {
  const user = auth.context.user;
  const id = user?.dbUser?.userId ?? user?.userId;
  return id === undefined ? undefined : String(id);
}
