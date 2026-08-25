/**
 * The single declaration of the auth DTOs. @branch/lambda-auth re-exports these
 * rather than declaring its own copy.
 */

/**
 * One `branch.project_memberships` row as authentication reads it.
 *
 * Structurally identical to `MembershipRow` in @branch/rbac on purpose -- it is
 * the same row -- but spelled here because @branch/types declares no
 * dependencies at all and so cannot import it. Keep the two in step.
 */
export interface AuthMembership {
  project_id: number;
  role: string;
}

/**
 * The `branch.users` row the caller was authenticated against.
 *
 * Its own object rather than flattened onto `AuthenticatedUser` because the
 * provenance differs and callers depend on which one they read:
 * `AuthenticatedUser.email` is the JWT claim (a Cognito *access* token carries
 * none), `dbUser.email` is the column. `GET /auth/me` reports the column.
 */
export interface AuthenticatedDbUser {
  userId: number;
  cognitoSub: string | null;
  email: string;
  name: string;
  isAdmin: boolean;
  profileImage: string | null;
}

export interface AuthenticatedUser {
  cognitoSub: string;
  userId?: number;
  /** The JWT `email` claim. Not the same field as `dbUser.email`. */
  email?: string;
  isAdmin: boolean;
  cognitoGroups?: string[];
  /** Set whenever `AuthContext.isAuthenticated` is true. */
  dbUser?: AuthenticatedDbUser;
  /**
   * Every membership this user holds, when the identity query already fetched
   * them (it joins them in). Absent means "not loaded", never "none": a user
   * with no memberships gets an empty array, so a caller can tell the two apart
   * instead of querying again to find out.
   */
  memberships?: readonly AuthMembership[];
}

export interface AuthContext {
  user?: AuthenticatedUser;
  isAuthenticated: boolean;
}

// AccessLevel / AuthorizationCheck used to live here: a flat enum of PUBLIC,
// AUTHENTICATED, ADMIN, SELF and ADMIN_OR_SELF. It could not express "admin or
// director" or "the author, until it is approved", and the frontend could not
// evaluate it at all. @branch/rbac replaced it; a second authorization
// mechanism left exported here would only invite a rule to drift back into it.
