import type { APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '@branch/rbac';
import { json } from './response';
import { matchPattern } from './match';
import { ANONYMOUS_AUTH } from './authz';
import { reportError } from './errors';
import type { Impersonator } from '@branch/lambda-auth';
import type { DispatchOptions, RequestAuth, Route } from './types';

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
 */
export async function dispatch(
  event: any,
  { prefix, routes, resolveAuth, onImpersonatedWrite, warmup }: DispatchOptions,
): Promise<APIGatewayProxyResult> {
  // Hoisted out of the try so the catch can name the route that failed.
  const rawPath: string = event?.rawPath || event?.path || '/';
  let path = rawPath.replace(/\/+$/, '') || '/';
  const method = (
    event?.requestContext?.http?.method ||
    event?.httpMethod ||
    'GET'
  ).toUpperCase();

  try {
    // Canonicalize to `/<prefix>...` when the prefix was stripped (dev-server).
    const base = `/${prefix}`;
    if (path !== base && !path.startsWith(`${base}/`)) {
      path = path === '/' ? base : base + path;
    }

    if (method === 'OPTIONS') return json(200, {});

    if (path === `${base}/health` && method === 'GET') {
      await warmup?.();
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    for (const route of routes) {
      if (route.method.toUpperCase() !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (!params) continue;

      const gate = await enforce(route, method, event, resolveAuth);
      const result =
        gate.response ??
        (await route.handler({ event, params, method, path, auth: gate.auth! }));

      // Refused writes too: an attempt is part of the trail.
      const impersonator = gate.auth?.context.user?.impersonator;
      if (impersonator && !READ_METHODS.has(method)) {
        await audit(onImpersonatedWrite, impersonator, method, path, result.statusCode);
      }
      return result;
    }

    return json(404, { message: 'Not Found', path, method });
  } catch (err) {
    console.error('Lambda error:', err);
    // The layer's wrapHandler only records throws, and catching here is what
    // gets API Gateway a JSON 500 instead of a 502 -- so hand it over by hand.
    reportError(err, { method, path });
    return json(500, { message: 'Internal Server Error' });
  }
}

type Gate =
  | { auth: RequestAuth; response?: undefined }
  | { auth?: RequestAuth; response: APIGatewayProxyResult };

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function audit(
  hook: DispatchOptions['onImpersonatedWrite'],
  impersonator: Impersonator,
  method: string,
  path: string,
  statusCode: number,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(impersonator, method, path, statusCode);
  } catch (err) {
    console.error('Impersonation audit failed:', err);
    reportError(err, { method, path });
  }
}

async function enforce(
  route: Route,
  method: string,
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
    console.error(err.message);
    reportError(err);
    return { response: json(500, { message: 'Internal Server Error' }) };
  }

  const auth = await resolveAuth(event);
  if (!auth.context.isAuthenticated) {
    const failure = auth.context.failure;
    if (failure) {
      return {
        response: json(failure.status, { message: failure.message, code: failure.code }),
      };
    }
    return { response: json(401, { message: 'Authentication required' }) };
  }

  const impersonator = auth.context.user?.impersonator;
  if (impersonator) {
    if (route.impersonation === 'blocked') {
      return { auth, response: json(403, { message: 'Not available while impersonating' }) };
    }
    if (impersonator.mode === 'read_only' && !READ_METHODS.has(method)) {
      return { auth, response: json(403, { message: 'Read-only impersonation' }) };
    }
  }

  if (route.permission) {
    const decision = authorize(auth.subject, route.permission);
    if (!decision.allowed) {
      return { auth, response: json(403, { message: decision.reason ?? 'Forbidden' }) };
    }
  }

  return { auth };
}
