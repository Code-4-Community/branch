import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthenticatedUser, AuthContext } from '@branch/dtos';
import db from './db';

export type { AuthenticatedUser, AuthContext };

// Load from environment variables
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
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

/**
 * Extract JWT token from Authorization header
 */
function extractToken(event: any): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }

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
    const payload = await getVerifier().verify(token);

    const dbUser = await db
      .selectFrom('branch.users')
      .where('cognito_sub', '=', payload.sub)
      .selectAll()
      .executeTakeFirst();

    if (!dbUser) {
      console.warn('User authenticated with Cognito but not found in database:', payload.sub);
      return { isAuthenticated: false };
    }

    const user: AuthenticatedUser = {
      cognitoSub: payload.sub,
      userId: dbUser.user_id,
      email: payload.email as string | undefined,
      isAdmin: dbUser.is_admin === true,
      cognitoGroups: payload['cognito:groups'] as string[] | undefined,
    };

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

