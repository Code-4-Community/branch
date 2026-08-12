/**
 * Shared auth DTOs used by every lambda's auth.ts.
 */

// Mirrors @branch/lambda-auth's src/types.ts; this package takes no dependencies, so keep the two in sync.

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
