import { ANONYMOUS, buildSubject, MembershipRow, RbacSubject } from '@branch/rbac';
import type { AuthContext } from './types';

// Same minimal structural type as authenticate.ts — keeps kysely out of this
// package's compile-time dependencies.
interface QueryableDb {
  selectFrom(table: any): any;
}

/**
 * The subject for a caller whose memberships `authenticateRequest` already
 * joined in, or `null` when they were not loaded and somebody has to query.
 *
 * `null` and "member of nothing" are different answers, which is why this reads
 * the presence of the array rather than its length: a hand-built context (every
 * lambda's tests build one) must still fall through to `loadRbacSubject`.
 */
export function preloadedSubject(authContext: AuthContext): RbacSubject | null {
  if (!authContext.isAuthenticated || !authContext.user?.userId) return null;
  const memberships = authContext.user.memberships;
  if (!memberships) return null;
  return buildSubject(authContext.user, memberships);
}

/**
 * Build the authorization subject for an authenticated request by reading the
 * memberships from Postgres, because nearly every rule needs them. The result
 * is also what `GET /auth/me` ships to the browser.
 *
 * `authenticateRequest` now fetches the same rows in the query that resolves the
 * identity, so the request path takes `preloadedSubject` and never gets here.
 * This remains the loader for a context that arrived without them.
 *
 * The assembly lives in `buildSubject` in @branch/rbac; this is the "read it
 * from Postgres" half.
 */
export async function loadRbacSubject(
  db: QueryableDb,
  authContext: AuthContext,
): Promise<RbacSubject> {
  const userId = authContext.user?.userId;
  if (!authContext.isAuthenticated || !userId) return ANONYMOUS;

  const preloaded = preloadedSubject(authContext);
  if (preloaded) return preloaded;

  const memberships: MembershipRow[] = await db
    .selectFrom('branch.project_memberships')
    .where('user_id', '=', userId)
    .select(['project_id', 'role'])
    .execute();

  return buildSubject(authContext.user, memberships);
}
