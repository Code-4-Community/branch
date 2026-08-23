import { ANONYMOUS, buildSubject, MembershipRow, RbacSubject } from '@branch/rbac';
import type { AuthContext } from './types';

// Same minimal structural type as authenticate.ts — keeps kysely out of this
// package's compile-time dependencies.
interface QueryableDb {
  selectFrom(table: any): any;
}

/**
 * Build the authorization subject for an authenticated request: one query at the
 * edge, because nearly every rule needs the caller's memberships. The result is
 * also what `GET /auth/me` ships to the browser.
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

  const memberships: MembershipRow[] = await db
    .selectFrom('branch.project_memberships')
    .where('user_id', '=', userId)
    .select(['project_id', 'role'])
    .execute();

  return buildSubject(authContext.user, memberships);
}
