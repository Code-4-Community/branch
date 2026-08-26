import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthContext, AuthenticatedUser, AuthMembership } from './types';

// Minimal structural type — avoids a hard dependency on kysely at compile time.
// Parameter typed as `any` so Kysely<DB>'s constrained overload is assignable.
interface QueryableDb {
  selectFrom(table: any): any;
}

let verifier: any = null;

// env is read lazily rather than at module scope so that a missing
// COGNITO_USER_POOL_ID does not poison import of this module, and so tests can
// vary the environment with jest.resetModules().
function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    const clientId =
      process.env.COGNITO_CLIENT_ID || process.env.COGNITO_APP_CLIENT_ID || '';
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is not set');
    }
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'access',
      // null disables the audience check. It is only reached when neither
      // COGNITO_CLIENT_ID nor COGNITO_APP_CLIENT_ID is set, which Terraform now
      // prevents in every deployed environment (infrastructure/aws/lambda.tf).
      clientId: clientId || null,
    });
  }
  return verifier;
}

export function extractToken(event: any): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return authHeader;
}

/**
 * One row of the identity query. The LEFT JOIN fans the single `branch.users`
 * row out to one row per membership, so the user columns repeat and the
 * membership columns are NULL for a user who holds none.
 */
interface CallerRow {
  user_id: number;
  cognito_sub: string | null;
  email: string;
  name: string;
  is_admin: boolean | null;
  profile_image: string | null;
  project_id: number | null;
  role: string | null;
}

/**
 * Resolve the caller in a single round trip: verify the token, then read the
 * `branch.users` row *and* its memberships with one LEFT JOIN.
 *
 * It used to be two strictly serial queries — identity, then memberships keyed
 * on the user_id the first one returned — which put two RTTs in front of every
 * guarded request in all six lambdas. The join is LEFT because a user with no
 * memberships must still authenticate; an inner join would sign them out.
 *
 * The columns are the union of what authentication and `GET /auth/me` need, so
 * `/auth/me` can answer from this context instead of re-reading the same row by
 * the same key.
 */
export async function authenticateRequest(
  db: QueryableDb,
  event: any,
): Promise<AuthContext> {
  const token = extractToken(event);
  if (!token) return { isAuthenticated: false };

  // Outside the try: missing config is a broken deployment, not a bad token.
  const jwtVerifier = getVerifier();

  let payload: any;
  try {
    payload = await jwtVerifier.verify(token);
  } catch (error) {
    // Only an unverifiable token is genuinely unauthenticated.
    console.error('Token verification failed:', error);
    return { isAuthenticated: false };
  }

  // Uncaught on purpose: a DB outage is not a 401. Catching it hid an unreachable
  // RDS behind "Authentication required" and logged users out. Handlers map to 500.
  const rows: CallerRow[] = await db
    .selectFrom('branch.users as u')
    .leftJoin('branch.project_memberships as pm', 'pm.user_id', 'u.user_id')
    .where('u.cognito_sub', '=', payload.sub)
    .select([
      'u.user_id',
      'u.cognito_sub',
      'u.email',
      'u.name',
      'u.is_admin',
      'u.profile_image',
      'pm.project_id',
      'pm.role',
    ])
    .execute();

  // No rows at all means no `branch.users` row — the LEFT JOIN guarantees at
  // least one row for a user that exists, membership or not.
  const dbUser = rows[0];
  if (!dbUser) {
    console.warn(
      'User authenticated with Cognito but not found in database:',
      payload.sub,
    );
    return { isAuthenticated: false };
  }

  const isAdmin = dbUser.is_admin === true;

  const user: AuthenticatedUser = {
    cognitoSub: payload.sub,
    userId: dbUser.user_id,
    email: payload.email as string | undefined,
    isAdmin,
    // Informational only. We deliberately do NOT promote on a Cognito
    // "Admins" group: branch.users.is_admin is the single source of truth.
    // A second source would make demotion via PATCH /users/{userId} silently
    // ineffective, nothing in this codebase writes group membership, and no
    // aws_cognito_user_group is defined in infrastructure/aws/cognito.tf.
    cognitoGroups: payload['cognito:groups'] as string[] | undefined,
    // The same row, under the names `GET /auth/me` reports. `email` above stays
    // the token claim; this one is the column.
    dbUser: {
      userId: dbUser.user_id,
      cognitoSub: dbUser.cognito_sub,
      email: dbUser.email,
      name: dbUser.name,
      isAdmin,
      profileImage: dbUser.profile_image,
    },
    memberships: collectMemberships(rows),
  };

  return { user, isAuthenticated: true };
}

/**
 * Dedupe the fanned-out rows down to the memberships.
 *
 * A user with no memberships arrives as exactly one row whose membership
 * columns are NULL; dropping those is what keeps the join from inventing a
 * phantom membership on a null project.
 */
function collectMemberships(rows: readonly CallerRow[]): AuthMembership[] {
  const memberships: AuthMembership[] = [];
  for (const row of rows) {
    if (row.project_id == null || row.role == null) continue;
    memberships.push({ project_id: row.project_id, role: row.role });
  }
  return memberships;
}
