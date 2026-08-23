import { ANONYMOUS, buildSubject, MembershipRow, RbacSubject } from '@branch/rbac';
import type { AuthContext } from './types';

// Same minimal structural type as authenticate.ts — keeps kysely out of this
// package's compile-time dependencies.
interface QueryableDb {
  selectFrom(table: any): any;
}

/**
 * Build the authorization subject for an authenticated request.
 *
 * One query, at the edge of the request, because almost every rule in the
 * policy needs the caller's memberships and re-reading them per rule would put
 * a round trip behind every button. The result is also what `GET /auth/me`
 * ships to the browser, so the frontend evaluates the identical policy against
 * the identical facts.
 *
 * The assembly itself lives in `buildSubject` in @branch/rbac — this function
 * is only the "read it from Postgres" half.
 */
export async function loadRbacSubject(
  db: QueryableDb,
  authContext: AuthContext,
): Promise<RbacSubject> {
  const userId = authContext.user?.userId;
  if (!authContext.isAuthenticated || !userId) return ANONYMOUS;

  const memberships: MembershipRow[] = await db
    .selectFrom('branch.project_memberships')
    .where('user_id', '=', userId)
    .select(['project_id', 'role'])
    .execute();

  return buildSubject(authContext.user, memberships);
}
