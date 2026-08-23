/**
 * The authorization subject: everything the policy is allowed to know about the
 * caller. Deliberately a plain serialisable object with no DB or HTTP types, so
 * the identical value can be built server-side from Postgres and shipped to the
 * browser in `GET /auth/me`. That is what lets both sides run the same policy.
 */
export interface RbacSubject {
  userId: number | null;
  isAdmin: boolean;
  /** Every project this user has any membership row on. */
  memberProjectIds: number[];
  /**
   * Projects where the membership role grants direction. Its non-emptiness is
   * the whole definition of "is a director" — there is no global director flag
   * on `branch.users`, and adding one was rejected in favour of deriving it.
   */
  directorProjectIds: number[];
}

/** Membership roles that make someone a director of a project. */
export const DIRECTOR_ROLES = ['Director', 'Admin'] as const;

export const ANONYMOUS: RbacSubject = {
  userId: null,
  isAdmin: false,
  memberProjectIds: [],
  directorProjectIds: [],
};

/** One membership row, as both Postgres and the tests spell it. */
export interface MembershipRow {
  project_id: number;
  role: string;
}

/**
 * Assemble a subject from an identity and its membership rows.
 *
 * Pure and storage-agnostic so the DB-backed loader in `@branch/lambda-auth`,
 * a unit test with no database, and any future caller all produce the same
 * shape — there is one definition of "director", and it lives here.
 */
export function buildSubject(
  user: { userId?: number | null; isAdmin?: boolean | null } | null | undefined,
  memberships: readonly MembershipRow[],
): RbacSubject {
  if (!user?.userId) return ANONYMOUS;

  const memberProjectIds: number[] = [];
  const directorProjectIds: number[] = [];
  for (const row of memberships) {
    memberProjectIds.push(row.project_id);
    if ((DIRECTOR_ROLES as readonly string[]).includes(row.role)) {
      directorProjectIds.push(row.project_id);
    }
  }

  return {
    userId: user.userId,
    isAdmin: user.isAdmin === true,
    memberProjectIds,
    directorProjectIds,
  };
}

export function isDirector(subject: RbacSubject): boolean {
  return subject.directorProjectIds.length > 0;
}

export function isMemberOf(subject: RbacSubject, projectId: number): boolean {
  return subject.memberProjectIds.includes(projectId);
}

export function isDirectorOf(subject: RbacSubject, projectId: number): boolean {
  return subject.directorProjectIds.includes(projectId);
}

export function isAuthenticated(subject: RbacSubject): boolean {
  return subject.userId !== null;
}

/**
 * Which projects a list query may return rows for.
 *
 * `'all'` rather than "every id in the table" on purpose: an admin's scope must
 * not become a giant `IN (...)` that silently goes stale between the membership
 * read and the query, and callers need to distinguish "unrestricted" from
 * "restricted to nothing".
 */
export function visibleProjectIds(subject: RbacSubject): number[] | 'all' {
  return subject.isAdmin ? 'all' : subject.memberProjectIds;
}

/** Sentinel id used to express "matches nothing" in a SQL `IN`. */
const MATCHES_NOTHING = -1;

/**
 * The `IN (...)` list for a project-scoped list query, or `null` when the
 * caller is unrestricted and the filter should be skipped entirely.
 *
 * Never returns an empty array: `IN ()` is a syntax error in Postgres, and the
 * obvious workaround — skipping the filter when the array is empty — turns "a
 * member of no projects" into "sees every row". A negative id can never match a
 * serial primary key, so the restrictive reading is the one that survives.
 */
export function projectScopeIds(subject: RbacSubject): number[] | null {
  const visible = visibleProjectIds(subject);
  if (visible === 'all') return null;
  return visible.length > 0 ? visible : [MATCHES_NOTHING];
}
