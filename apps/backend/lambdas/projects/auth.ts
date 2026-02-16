import { CognitoJwtVerifier } from 'aws-jwt-verify';
import db from './db';

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

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
  email?: string;
  isAdmin: boolean;
  cognitoGroups?: string[];
}

export interface AuthContext {
  user?: AuthenticatedUser;
  isAuthenticated: boolean;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

function extractToken(event: any): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return authHeader;
}

export async function authenticateRequest(event: any): Promise<AuthContext> {
  const token = extractToken(event);
  if (!token) return { isAuthenticated: false };

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

    return { user, isAuthenticated: true };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Authorization levels:
 *   AUTHENTICATED  — any logged-in user
 *   PROJECT_MEMBER — admin, or any role on the project
 *   ADMIN_OR_PI    — admin, or PI role on the project
 *   ADMIN          — global admin only
 */
export async function checkAuthorization(
  authContext: AuthContext,
  level: 'AUTHENTICATED' | 'PROJECT_MEMBER' | 'ADMIN_OR_PI' | 'ADMIN',
  projectId?: string
): Promise<AuthorizationResult> {
  if (!authContext.isAuthenticated || !authContext.user) {
    return { allowed: false, reason: 'Authentication required' };
  }

  const { user } = authContext;

  if (level === 'AUTHENTICATED') {
    return { allowed: true };
  }

  if (level === 'ADMIN') {
    return user.isAdmin
      ? { allowed: true }
      : { allowed: false, reason: 'Admin access required' };
  }

  // PROJECT_MEMBER and ADMIN_OR_PI both need a projectId
  if (!projectId) {
    return { allowed: false, reason: 'Project ID required for authorization' };
  }

  if (user.isAdmin) return { allowed: true };

  const membership = await db
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', Number(projectId))
    .where('user_id', '=', user.userId!)
    .select('role')
    .executeTakeFirst();

  if (level === 'PROJECT_MEMBER') {
    return membership
      ? { allowed: true }
      : { allowed: false, reason: 'Project membership required' };
  }

  // ADMIN_OR_PI
  if (membership && ['PI', 'Admin'].includes(membership.role)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'PI or Admin role required' };
}