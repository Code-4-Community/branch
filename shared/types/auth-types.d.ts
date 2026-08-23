/**
 * The single declaration of the auth DTOs. @branch/lambda-auth re-exports these
 * rather than declaring its own copy.
 */

export interface AuthenticatedUser {
  cognitoSub: string;
  userId?: number;
  email?: string;
  isAdmin: boolean;
  cognitoGroups?: string[];
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
