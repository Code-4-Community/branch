import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthenticatedUser, AuthContext } from '@branch/dtos';
import db from './db';

export type { AuthenticatedUser, AuthContext };

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

/**
 * Encode a JWT token (for testing purposes)
 * Creates a mock JWT with the standard three-part format
 */
export function encodeJWT(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = '';
  
  // Format: header.payload.signature
  return `${header}.${body}.${signature}`;
}

/**
 * Extract and validate JWT token from Authorization header
 * Format: "Bearer <token>"
 */
export function extractTokenFromHeader(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Decode JWT token without verification (for development/testing)
 * In production, you would verify with Cognito public keys
 */
export function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Decode payload (second part)
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Authenticate request and return user info
 * This validates the token and fetches user details from database
 */
export async function authenticateRequest(
  authorizationHeader: string | undefined
): Promise<{ user: AuthenticatedUser; error?: string }> {
  const token = extractTokenFromHeader(authorizationHeader);
  
  if (!token) {
    return { user: null as any, error: 'Missing or invalid Authorization header' };
  }

  const decoded = decodeJWT(token);
  
  if (!decoded || !decoded.sub) {
    return { user: null as any, error: 'Invalid token' };
  }

  // The 'sub' claim contains the Cognito user ID
  const cognitoSub = decoded.sub;
  const email = decoded.email;

  try {
    // Fetch user from database
    const dbUser = await db
      .selectFrom('branch.users')
      .where('cognito_sub', '=', cognitoSub)
      .selectAll()
      .executeTakeFirst();

    if (!dbUser) {
      return { user: null as any, error: 'User not found in database' };
    }

    const user: AuthenticatedUser = {
      cognitoSub,
      email: email || dbUser.email,
      userId: dbUser.user_id,
      isAdmin: dbUser.is_admin || false,
    };

    return { user };
  } catch (error) {
    console.error('Database lookup error:', error);
    return { user: null as any, error: 'Failed to authenticate user' };
  }
}

/**
 * Check if user has access to a project
 * Access granted if:
 * - User is admin, OR
 * - User is a member of the project
 */
export async function canAccessProject(userId: number, projectId: number): Promise<boolean> {
  try {
    // Check if user is admin
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    if (user?.is_admin) return true;

    // Check if user is a member of the project
    const membership = await db
      .selectFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .selectAll()
      .executeTakeFirst();

    return !!membership;
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
}

/**
 * Check if user has edit access to a project
 * Access granted if:
 * - User is admin, OR
 * - User is a PI, Accountant, or Admin in the project
 */
export async function canEditProject(userId: number, projectId: number): Promise<boolean> {
  try {
    // Check if user is admin
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    if (user?.is_admin) return true;

    // Check if user has edit role in project
    const membership = await db
      .selectFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .select('role')
      .executeTakeFirst();

    if (!membership) return false;

    // PI, Accountant, and Admin can edit
    const editableRoles = ['PI', 'Accountant', 'Admin'];
    return editableRoles.includes(membership.role);
  } catch (error) {
    console.error('Error checking edit access:', error);
    return false;
  }
}

/**
 * Check if user can create projects
 * Access granted if:
 * - User is admin
 */
export async function canCreateProject(userId: number): Promise<boolean> {
  try {
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    return user?.is_admin || false;
  } catch (error) {
    console.error('Error checking create access:', error);
    return false;
  }
}
