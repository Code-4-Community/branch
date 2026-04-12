import { CognitoJwtVerifier } from 'aws-jwt-verify';
import db from './db';

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const COGNITO_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID!;

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
  cognitoSub: string;
  userId?: number;
  email: string;
  isAdmin?: boolean;
  cognitoGroups?: string[];
}

export interface AuthContext {
  user?: AuthenticatedUser;
  isAuthenticated: boolean;
}

/**
 * Encode a JWT token
 */
function extractToken(event: any): string | null {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;

    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
    }

    return authHeader;
}

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
            return { isAuthenticated: false };
        }

        const user: AuthenticatedUser = {
            cognitoSub: payload.sub,
            email: payload.email,
            userId: dbUser.user_id,
            isAdmin: dbUser.is_admin || false,
            cognitoGroups: payload['cognito:groups'] || [],
        };

        if (user.cognitoGroups?.includes('Admins')) {
            user.isAdmin = true;
        }

        return { user, isAuthenticated: true };
    } catch (error) {
        console.error('Authentication error:', error);
        return { isAuthenticated: false };
    }
}