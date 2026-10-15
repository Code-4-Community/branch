import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type {
  AuthContext,
  AuthenticatedUser,
  AuthFailure,
  AuthMembership,
  ImpersonationMode,
} from './types';

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

/** Sent by the staff console on every request made while switched in. */
export const IMPERSONATION_HEADER = 'x-impersonate-session';

export function extractImpersonationSession(event: any): string | null {
  const headers: Record<string, unknown> = event?.headers ?? {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === IMPERSONATION_HEADER && typeof value === 'string') {
      return value.trim() || null;
    }
  }
  return null;
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
  is_staff: boolean | null;
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
  const rows = await selectIdentity(db, 'u.cognito_sub', payload.sub);

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

  const sessionId = extractImpersonationSession(event);
  if (sessionId) return impersonate(db, dbUser, sessionId);

  const user = toAuthenticatedUser(rows, payload.sub);
  // Informational only. We deliberately do NOT promote on a Cognito
  // "Admins" group: branch.users.is_admin is the single source of truth.
  // A second source would make demotion via PATCH /users/{userId} silently
  // ineffective, nothing in this codebase writes group membership, and no
  // aws_cognito_user_group is defined in infrastructure/aws/cognito.tf.
  user.cognitoGroups = payload['cognito:groups'] as string[] | undefined;
  // The JWT claim; `dbUser.email` is the column.
  user.email = payload.email as string | undefined;

  return { user, isAuthenticated: true };
}

/**
 * The caller's `branch.users` row fanned out over its memberships, in one round
 * trip. LEFT because a user with no memberships must still authenticate; an
 * inner join would sign them out.
 */
async function selectIdentity(
  db: QueryableDb,
  column: 'u.cognito_sub' | 'u.user_id',
  value: string | number,
): Promise<CallerRow[]> {
  return db
    .selectFrom('branch.users as u')
    .leftJoin('branch.project_memberships as pm', 'pm.user_id', 'u.user_id')
    .where(column, '=', value)
    .select([
      'u.user_id',
      'u.cognito_sub',
      'u.email',
      'u.name',
      'u.is_admin',
      'u.is_staff',
      'u.profile_image',
      'pm.project_id',
      'pm.role',
    ])
    .execute();
}

function toAuthenticatedUser(
  rows: readonly CallerRow[],
  cognitoSub: string,
): AuthenticatedUser {
  const row = rows[0];
  const isAdmin = row.is_admin === true;
  const isStaff = row.is_staff === true;
  return {
    cognitoSub,
    userId: row.user_id,
    isAdmin,
    isStaff,
    // The same row, under the names `GET /auth/me` reports.
    dbUser: {
      userId: row.user_id,
      cognitoSub: row.cognito_sub,
      email: row.email,
      name: row.name,
      isAdmin,
      isStaff,
      profileImage: row.profile_image,
    },
    memberships: collectMemberships(rows),
  };
}

interface SessionRow {
  session_id: string;
  target_user_id: number;
  mode: ImpersonationMode;
  expires_at: Date;
  ended_at: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXPIRED: AuthFailure = {
  status: 401,
  code: 'IMPERSONATION_EXPIRED',
  message: 'Impersonation session has ended',
};

function refuse(failure: AuthFailure): AuthContext {
  return { isAuthenticated: false, failure };
}

/**
 * Swap a staff caller for the user their session names. Everything downstream —
 * the subject, list scoping, `entered_by` — then sees only the target.
 *
 * A header from a non-staff caller is refused rather than ignored: silently
 * serving them as themselves would hide a client bug or a probe.
 */
async function impersonate(
  db: QueryableDb,
  staff: CallerRow,
  sessionId: string,
): Promise<AuthContext> {
  if (staff.is_staff !== true) {
    return refuse({
      status: 403,
      code: 'IMPERSONATION_FORBIDDEN',
      message: 'Only staff accounts can impersonate',
    });
  }
  if (!UUID.test(sessionId)) return refuse(EXPIRED);

  const sessions: SessionRow[] = await db
    .selectFrom('branch.impersonation_sessions')
    .where('session_id', '=', sessionId)
    .where('staff_user_id', '=', staff.user_id)
    .select(['session_id', 'target_user_id', 'mode', 'expires_at', 'ended_at'])
    .execute();
  const session = sessions[0];
  if (!session || session.ended_at !== null || session.expires_at <= new Date()) {
    return refuse(EXPIRED);
  }

  const rows = await selectIdentity(db, 'u.user_id', session.target_user_id);
  if (!rows[0]) return refuse(EXPIRED);
  if (rows[0].is_staff === true) {
    return refuse({
      status: 403,
      code: 'IMPERSONATION_FORBIDDEN',
      message: 'Staff accounts cannot be impersonated',
    });
  }

  const user = toAuthenticatedUser(rows, rows[0].cognito_sub ?? '');
  user.impersonator = {
    userId: staff.user_id,
    name: staff.name,
    email: staff.email,
    sessionId: session.session_id,
    mode: session.mode,
    expiresAt: session.expires_at.toISOString(),
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
