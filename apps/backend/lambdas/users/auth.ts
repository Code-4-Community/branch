import { APIGatewayProxyEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import db from './db';

// Load from environment variables
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_REGION = process.env.AWS_REGION || 'us-east-2';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

// Create verifier instance lazily (only when needed)
let verifier: any = null;

function getVerifier() {
  if (!verifier) {
    if (!COGNITO_USER_POOL_ID) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is not set');
    }
    verifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: 'access',
      clientId: COGNITO_CLIENT_ID,
    });
  }
  return verifier;
}

export interface AuthenticatedUser {
  cognitoSub: string; // Cognito sub (matches cognito_sub in your DB)
  userId?: number; // Database user_id (loaded from DB)
  email?: string;
  isAdmin: boolean;
  cognitoGroups?: string[];
}

export interface AuthContext {
  user?: AuthenticatedUser;
  isAuthenticated: boolean;
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(event: any): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }

  // Support raw token
  return authHeader;
}

/**
 * Verify and decode Cognito JWT token, then load user from database
 */
export async function authenticateRequest(event: any): Promise<AuthContext> {
  const token = extractToken(event);

  if (!token) {
    return { isAuthenticated: false };
  }

  try {
    // Verify the token with Cognito
    const payload = await getVerifier().verify(token);

    // Look up user in database by cognito_sub
    const dbUser = await db
      .selectFrom('branch.users')
      .where('cognito_sub', '=', payload.sub)
      .selectAll()
      .executeTakeFirst();

    if (!dbUser) {
      console.warn('User authenticated with Cognito but not found in database:', payload.sub);
      return { isAuthenticated: false };
    }

    // Extract user information from token claims and database
    const user: AuthenticatedUser = {
      cognitoSub: payload.sub,
      userId: dbUser.user_id,
      email: payload.email as string | undefined,
      isAdmin: dbUser.is_admin === true,
      cognitoGroups: payload['cognito:groups'] as string[] | undefined,
    };

    // Also check Cognito groups for admin status (as backup)
    if (user.cognitoGroups?.includes('Admins')) {
      user.isAdmin = true;
    }

    return {
      user,
      isAuthenticated: true,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Authorization helpers for different access levels
 */
export type AccessLevel = 'PUBLIC' | 'AUTHENTICATED' | 'ADMIN' | 'SELF' | 'ADMIN_OR_SELF';

export interface AuthorizationCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if user is authorized for a given access level
 * @param authContext - The authentication context
 * @param requiredAccess - Required access level
 * @param resourceUserId - The user_id of the resource being accessed (for SELF/ADMIN_OR_SELF checks)
 */
export function checkAuthorization(
  authContext: AuthContext,
  requiredAccess: AccessLevel,
  resourceUserId?: number | string
): AuthorizationCheck {
  if (requiredAccess === 'PUBLIC') {
    return { allowed: true };
  }

  // All other access levels require authentication
  if (!authContext.isAuthenticated || !authContext.user) {
    return { 
      allowed: false, 
      reason: 'Authentication required' 
    };
  }

  const { user } = authContext;

  switch (requiredAccess) {
    case 'AUTHENTICATED':
      return { allowed: true };

    case 'ADMIN':
      if (!user.isAdmin) {
        return { 
          allowed: false, 
          reason: 'Admin access required' 
        };
      }
      return { allowed: true };

    case 'SELF':
      if (!resourceUserId) {
        return { 
          allowed: false, 
          reason: 'Resource user ID required for SELF access check' 
        };
      }
      // Compare with database user_id
      if (user.userId !== Number(resourceUserId)) {
        return { 
          allowed: false, 
          reason: 'Can only access own resources' 
        };
      }
      return { allowed: true };

    case 'ADMIN_OR_SELF':
      if (!resourceUserId) {
        return { 
          allowed: false, 
          reason: 'Resource user ID required for ADMIN_OR_SELF access check' 
        };
      }
      // Admin can access anything, or user can access their own resources
      if (user.isAdmin || user.userId === Number(resourceUserId)) {
        return { allowed: true };
      }
      return { 
        allowed: false, 
        reason: 'Admin access or resource ownership required' 
      };

    default:
      return { 
        allowed: false, 
        reason: 'Unknown access level' 
      };
  }
}