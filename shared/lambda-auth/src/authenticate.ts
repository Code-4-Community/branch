import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthContext, AuthenticatedUser } from './types';

// Minimal structural type — avoids a hard dependency on kysely at compile time.
// Parameter typed as `any` so Kysely<DB>'s constrained overload is assignable.
interface QueryableDb {
  selectFrom(table: any): any;
}

let verifier: any = null;

// env is read lazily rather than at module scope so that a missing
// COGNITO_USER_POOL_ID does not poison import of this module, and so tests can
// vary the environment with jest.resetModules().
function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    const clientId =
      process.env.COGNITO_CLIENT_ID || process.env.COGNITO_APP_CLIENT_ID || '';
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is not set');
    }
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'access',
      // null disables the audience check. It is only reached when neither
      // COGNITO_CLIENT_ID nor COGNITO_APP_CLIENT_ID is set, which Terraform now
      // prevents in every deployed environment (infrastructure/aws/lambda.tf).
      clientId: clientId || null,
    });
  }
  return verifier;
}

export function extractToken(event: any): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return authHeader;
}

export async function authenticateRequest(
  db: QueryableDb,
  event: any,
): Promise<AuthContext> {
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
      console.warn(
        'User authenticated with Cognito but not found in database:',
        payload.sub,
      );
      return { isAuthenticated: false };
    }

    const user: AuthenticatedUser = {
      cognitoSub: payload.sub,
      userId: dbUser.user_id,
      email: payload.email as string | undefined,
      isAdmin: dbUser.is_admin === true,
      // Informational only. We deliberately do NOT promote on a Cognito
      // "Admins" group: branch.users.is_admin is the single source of truth.
      // A second source would make demotion via PATCH /users/{userId} silently
      // ineffective, nothing in this codebase writes group membership, and no
      // aws_cognito_user_group is defined in infrastructure/aws/cognito.tf.
      cognitoGroups: payload['cognito:groups'] as string[] | undefined,
    };

    return { user, isAuthenticated: true };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { isAuthenticated: false };
  }
}
