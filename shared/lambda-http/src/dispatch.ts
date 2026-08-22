import type { APIGatewayProxyResult } from 'aws-lambda';
import { json } from './response';
import { matchPattern } from './match';
import type { DispatchOptions } from './types';

/**
 * Route a Lambda event to the first matching route and return its response.
 *
 * Canonicalizes the incoming path to the full prefixed shape so a single route
 * table works under both:
 *  - API Gateway `{proxy+}` — delivers the full path, e.g. `/auth/login`.
 *  - the shared dev-server — routes by first segment then strips it, e.g. `/login`
 *    (and `/` for a bare service root).
 *
 * Handles OPTIONS preflight, `/<prefix>/health`, 404, and 500 centrally.
 */
export async function dispatch(
  event: any,
  { prefix, routes }: DispatchOptions,
): Promise<APIGatewayProxyResult> {
  try {
    const rawPath: string = event.rawPath || event.path || '/';
    let path = rawPath.replace(/\/+$/, '') || '/';
    const method = (
      event.requestContext?.http?.method ||
      event.httpMethod ||
      'GET'
    ).toUpperCase();

    // Canonicalize to `/<prefix>...` when the prefix was stripped (dev-server).
    const base = `/${prefix}`;
    if (path !== base && !path.startsWith(`${base}/`)) {
      path = path === '/' ? base : base + path;
    }

    if (method === 'OPTIONS') return json(200, {});

    if (path === `${base}/health` && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    for (const route of routes) {
      if (route.method.toUpperCase() !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (params) {
        return await route.handler({ event, params, method, path });
      }
    }

    return json(404, { message: 'Not Found', path, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
}
