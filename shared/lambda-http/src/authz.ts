import type { APIGatewayProxyResult } from 'aws-lambda';
import { checkAuthorization } from '@branch/lambda-auth';
import type { AccessLevel, AuthContext } from '@branch/lambda-auth';
import { json } from './response';

/**
 * Turn an authorization decision into a response, or `undefined` when allowed.
 * 401 when the caller never authenticated, 403 when they did but lack access.
 */
export function requireAuth(
  authContext: AuthContext,
  level: AccessLevel,
  resourceUserId?: number | string,
): APIGatewayProxyResult | undefined {
  const check = checkAuthorization(authContext, level, resourceUserId);
  if (check.allowed) return undefined;
  return authContext.isAuthenticated
    ? json(403, { message: check.reason || 'Forbidden' })
    : json(401, { message: 'Authentication required' });
}

export type AuthGuardResult =
  | { ctx: AuthContext; response?: undefined }
  | { ctx?: undefined; response: APIGatewayProxyResult };

/**
 * Bind a service's db-scoped `authenticateRequest` into a guard that
 * authenticates and authorizes in one call.
 */
export function createAuthGuard(
  authenticate: (event: any) => Promise<AuthContext>,
) {
  return async function guard(
    event: any,
    level: AccessLevel = 'AUTHENTICATED',
    resourceUserId?: number | string,
  ): Promise<AuthGuardResult> {
    const ctx = await authenticate(event);
    const denied = requireAuth(ctx, level, resourceUserId);
    if (denied) return { response: denied };
    return { ctx };
  };
}
