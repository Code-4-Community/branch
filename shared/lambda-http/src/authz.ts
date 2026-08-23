import type { APIGatewayProxyResult } from 'aws-lambda';
import { ANONYMOUS, authorize } from '@branch/rbac';
import type { Action, RbacSubject, ResourceOf } from '@branch/rbac';
import type { AuthContext } from '@branch/lambda-auth';
import { json } from './response';
import type { RequestAuth } from './types';

/** The subject a public route sees. */
export const ANONYMOUS_AUTH: RequestAuth = {
  context: { isAuthenticated: false },
  subject: ANONYMOUS,
};

/**
 * Turn a policy decision into a response, or `undefined` when allowed.
 *
 * The 403 body is the policy's own `reason`, which is the same string the
 * frontend puts in the tooltip on the disabled control. One wording, produced
 * in one place.
 */
export function requirePermission<A extends Action>(
  subject: RbacSubject | null | undefined,
  action: A,
  ...[resource]: ResourceOf<A> extends void ? [] : [ResourceOf<A>]
): APIGatewayProxyResult | undefined {
  const decision = (authorize as any)(subject, action, resource);
  if (decision.allowed) return undefined;
  return json(403, { message: decision.reason ?? 'Forbidden' });
}

/**
 * Bind a service's db-scoped authenticate + subject loader into the
 * `resolveAuth` shape `dispatch` expects.
 *
 * Two halves, one round trip: `authenticate` joins the caller's memberships into
 * the identity query, so `loadSubject` (`loadRbacSubject`) assembles them from
 * the context it is handed rather than querying again. It stays a separate
 * argument because a caller that builds a context by hand -- every lambda's
 * tests do -- still needs something that can go and read them.
 */
export function createAuthResolver(
  authenticate: (event: any) => Promise<AuthContext>,
  loadSubject: (context: AuthContext) => Promise<RbacSubject>,
) {
  return async function resolveAuth(event: any): Promise<RequestAuth> {
    const context = await authenticate(event);
    if (!context.isAuthenticated) return { context, subject: ANONYMOUS };
    return { context, subject: await loadSubject(context) };
  };
}
