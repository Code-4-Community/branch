import { APIGatewayProxyResult } from 'aws-lambda';
import {
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  RespondToAuthChallengeCommand,
  GlobalSignOutCommand,
  GlobalSignOutCommandInput,
  ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, parseBody, reportError, serverError } from '@branch/lambda-http';
import type { RouteHandler } from '@branch/lambda-http';
import { authenticateRequest } from '../auth';
import db from '../db';
import { resolveProfileImage } from '../photos';
import {
  cognitoClient,
  USER_POOL_CLIENT_ID,
  CHALLENGE_SPECS,
  authResultResponse,
  challengeResponse,
  mapCognitoAuthError,
  validatePassword,
} from '../services/cognito';

/**
 * POST /login
 *
 * Uses USER_PASSWORD_AUTH rather than SRP. The browser already posts the
 * plaintext password to this endpoint over TLS, so server-side SRP adds no
 * confidentiality -- and unlike the SRP library, the SDK hands back the
 * challenge Session as an opaque string that survives across invocations,
 * which is what makes a stateless POST /respond-challenge possible.
 *
 * Every branch returns. An unrecognised ChallengeName is passed to the client
 * as a value rather than silently never resolving a promise, which is how the
 * previous callback-based implementation hung until the 30s lambda timeout.
 */
export async function handleLogin(event: any): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (!body) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { email, password } = body;
  if (!email || !password) {
    return json(400, { message: 'email and password are required' });
  }

  // Registration stores email.toLowerCase(), so sign-in must match.
  const username = String(email).toLowerCase();

  const params: InitiateAuthCommandInput = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: USER_POOL_CLIENT_ID,
    // No SECRET_HASH: the app client is created with generate_secret = false.
    AuthParameters: { USERNAME: username, PASSWORD: String(password) },
  };

  try {
    const response = await cognitoClient.send(new InitiateAuthCommand(params));

    if (response.AuthenticationResult) {
      return authResultResponse(response.AuthenticationResult);
    }

    if (response.ChallengeName) {
      // MFA_SETUP cannot be answered by RespondToAuthChallenge alone -- it needs
      // AssociateSoftwareToken/VerifySoftwareToken enrollment, which is not
      // built yet. Return the Session anyway so a future enrollment endpoint can
      // resume without forcing a fresh sign-in.
      if (response.ChallengeName === 'MFA_SETUP') {
        return json(403, {
          ChallengeName: response.ChallengeName,
          Session: response.Session,
          message: 'MFA enrollment is required but not yet supported',
        });
      }
      return challengeResponse(response);
    }

    return serverError(
      new Error('Cognito returned neither AuthenticationResult nor a challenge'),
      'Unexpected response from authentication service',
    );
  } catch (error: any) {
    return mapCognitoAuthError(error, 'login');
  }
}

/**
 * POST /respond-challenge
 *
 * Answers whatever POST /login returned, using the opaque Session string.
 * Responses chain: a challenge may be followed by another challenge (the usual
 * NEW_PASSWORD_REQUIRED then TOTP-enrollment path), so the caller must branch on
 * the response the same way it branches on /login.
 */
export async function handleRespondChallenge(event: any): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (!body) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { challengeName, session, email } = body;
  if (!challengeName || !session || !email) {
    return json(400, {
      message: 'challengeName, session, and email are required',
    });
  }

  const spec = CHALLENGE_SPECS[String(challengeName)];
  if (!spec) {
    return json(400, {
      message: `Unsupported challenge: ${challengeName}`,
      supported: Object.keys(CHALLENGE_SPECS),
    });
  }

  for (const field of spec.required) {
    if (!body[field]) {
      return json(400, { message: `${field} is required for ${challengeName}` });
    }
  }

  if (challengeName === 'NEW_PASSWORD_REQUIRED') {
    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return json(400, { message: passwordError });
    }
  }

  try {
    const response = await cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ClientId: USER_POOL_CLIENT_ID,
        ChallengeName: challengeName as ChallengeNameType,
        Session: String(session),
        ChallengeResponses: spec.build(body, String(email).toLowerCase()),
      }),
    );

    if (response.AuthenticationResult) {
      return authResultResponse(response.AuthenticationResult);
    }
    if (response.ChallengeName) {
      return challengeResponse(response);
    }
    return serverError(
      new Error('Cognito returned neither AuthenticationResult nor a challenge'),
      'Unexpected response from authentication service',
    );
  } catch (error: any) {
    return mapCognitoAuthError(error, 'challenge');
  }
}

/**
 * POST /refresh
 *
 * Exchanges a refresh token for a new access and ID token. Cognito does NOT
 * return a new refresh token here (no rotation is configured), so the client
 * must keep the one it already stored until it expires.
 */
export async function handleRefresh(event: any): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (!body) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { refreshToken } = body;
  if (!refreshToken) {
    return json(400, { message: 'refreshToken is required' });
  }

  try {
    const response = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: USER_POOL_CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: String(refreshToken) },
      }),
    );

    if (!response.AuthenticationResult) {
      return json(401, { message: 'Refresh token is invalid or expired' });
    }
    return authResultResponse(response.AuthenticationResult);
  } catch (error: any) {
    return mapCognitoAuthError(error, 'refresh');
  }
}

/**
 * GET /me -- the canonical session bootstrap endpoint.
 *
 * Everything is read from Postgres rather than the token, for two reasons: a
 * Cognito *access* token carries sub/scope/client_id/token_use but neither email
 * nor name, and is_admin exists only in branch.users -- there is no
 * pre-token-generation trigger, so it is not a JWT claim. This endpoint is the
 * only way the frontend can learn whether the caller is an admin.
 */
export const handleMe: RouteHandler = async ({ auth }) => {
  // `access: 'authenticated'` on the route means dispatch has already verified
  // the session and loaded the subject; re-doing either here would be a second
  // token verification and a second memberships query per request.
  const user = auth.context.user;
  if (!user) {
    return json(401, { message: 'Authentication required' });
  }

  const me = await db
    .selectFrom('branch.users')
    .where('cognito_sub', '=', user.cognitoSub)
    .select(['user_id', 'cognito_sub', 'email', 'name', 'is_admin', 'profile_image'])
    .executeTakeFirst();

  // Defensive: authenticateRequest already rejects a token whose sub has no row,
  // so this is unreachable today. Kept so a future refactor cannot turn a
  // missing row into a 500. 401 rather than 404 -- from the caller's point of
  // view the session is unusable, and it keeps /me from being a user-existence
  // oracle.
  if (!me) {
    return json(401, { message: 'Authentication required' });
  }

  return json(200, {
    userId: me.user_id,
    cognitoSub: me.cognito_sub,
    email: me.email,
    name: me.name,
    isAdmin: me.is_admin === true,
    profileImage: await resolveProfileImage(me.profile_image),
    // The RBAC subject travels with identity so the browser evaluates the same
    // policy against the same facts the lambdas used. Without it the frontend
    // would have to re-derive "is a director" and "which projects am I on"
    // from separate endpoints -- exactly the drift @branch/rbac exists to stop.
    rbac: auth.subject,
  });
};

/** POST /logout -- revokes every token issued to the caller's Cognito session. */
export async function handleLogout(event: any): Promise<APIGatewayProxyResult> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    return json(401, { message: 'Authorization header is required' });
  }

  // Extract token (remove "Bearer " prefix if present)
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!accessToken) {
    return json(401, { message: 'Access token is required' });
  }

  const params: GlobalSignOutCommandInput = {
    AccessToken: accessToken,
  };

  try {
    await cognitoClient.send(new GlobalSignOutCommand(params));
    return json(200, { message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);

    if (error.name === 'NotAuthorizedException') {
      return json(401, { message: 'Invalid or expired token' });
    }

    reportError(error);
    return json(500, { message: 'Failed to logout' });
  }
}
