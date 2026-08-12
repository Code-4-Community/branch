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

export type AccessLevel = 'PUBLIC' | 'AUTHENTICATED' | 'ADMIN' | 'SELF' | 'ADMIN_OR_SELF';

export interface AuthorizationCheck {
  allowed: boolean;
  reason?: string;
}
