import { APIGatewayProxyResult } from 'aws-lambda';
import {
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, parseBody } from '@branch/lambda-http';
import type { RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { cognitoClient } from '../services/cognito';

/**
 * Bearer token for the four MFA endpoints below. These call
 * AssociateSoftwareToken / VerifySoftwareToken / SetUserMFAPreference / GetUser,
 * which Cognito authorizes against the access token itself.
 */
function getBearerAccessToken(event: any): string | null {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token || null;
}

/** Cognito error -> HTTP mapping shared by the four MFA endpoints. */
function mapMfaError(error: any): APIGatewayProxyResult {
  console.error('Cognito MFA error:', error);
  const code = error?.name;

  switch (code) {
    case 'NotAuthorizedException':
      return json(401, { message: 'Access token is invalid or expired', code });
    case 'CodeMismatchException':
      return json(400, { message: 'Invalid verification code', code });
    case 'EnableSoftwareTokenMFAException':
      return json(400, { message: 'Could not enable MFA with that code', code });
    case 'SoftwareTokenMFANotFoundException':
      return json(400, {
        message: 'No MFA enrollment in progress, call /mfa-setup again',
        code,
      });
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return json(429, { message: 'Too many attempts, please try again later', code });
    default:
      return json(500, { message: 'MFA request failed', error: error?.message, code });
  }
}

/**
 * POST /auth/mfa-setup
 *
 * Starts TOTP enrollment for the signed-in user. AssociateSoftwareToken hands
 * back a fresh secret every call -- the caller is expected to follow up with
 * POST /auth/mfa-verify using the *same* secret's current code, not a stale one
 * from an earlier call.
 */
export const handleMfaSetup: RouteHandler = async ({ event, auth }) => {
  const accessToken = getBearerAccessToken(event);
  if (!accessToken) {
    return json(401, { message: 'Authorization header is required' });
  }

  // The route is `access: 'authenticated'`, so dispatch has already verified
  // the session -- this handler used to re-run authenticateRequest itself.
  // `user` is always set alongside isAuthenticated; narrowed for the compiler.
  const user = auth.context.user;
  if (!user) return json(401, { message: 'Authentication required' });

  const me = await db
    .selectFrom('branch.users')
    .where('cognito_sub', '=', user.cognitoSub)
    .select(['email'])
    .executeTakeFirst();

  try {
    const response = await cognitoClient.send(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );

    const secretCode = response.SecretCode;
    if (!secretCode) {
      return json(500, { message: 'Failed to generate MFA secret' });
    }

    const label = encodeURIComponent(`BRANCH:${me?.email ?? user.cognitoSub}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secretCode}&issuer=BRANCH`;

    return json(200, { secretCode, otpauthUrl });
  } catch (error: any) {
    return mapMfaError(error);
  }
};

/**
 * POST /auth/mfa-verify
 *
 * Confirms the code from an authenticator app and, only on success, enables
 * SOFTWARE_TOKEN_MFA as the user's preferred factor. VerifySoftwareToken alone
 * does not turn MFA on -- SetUserMFAPreference is a separate call.
 */
export const handleMfaVerify: RouteHandler = async ({ event }) => {
  const accessToken = getBearerAccessToken(event);
  if (!accessToken) {
    return json(401, { message: 'Authorization header is required' });
  }

  const body = parseBody(event);
  if (!body) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { code } = body;
  if (!code) {
    return json(400, { message: 'code is required' });
  }

  try {
    const verifyResponse = await cognitoClient.send(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: String(code),
        FriendlyDeviceName: 'Authenticator app',
      }),
    );

    if (verifyResponse.Status !== 'SUCCESS') {
      return json(400, { message: 'Invalid verification code' });
    }

    await cognitoClient.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    return json(200, { message: 'MFA enabled' });
  } catch (error: any) {
    return mapMfaError(error);
  }
};

/**
 * POST /auth/mfa-disable
 *
 * Turns SOFTWARE_TOKEN_MFA back off for the signed-in user. Does not revoke the
 * underlying TOTP secret in the authenticator app -- re-enrolling via
 * /auth/mfa-setup issues a new one, so a disabled-then-re-enabled account never
 * silently trusts the old code.
 */
export const handleMfaDisable: RouteHandler = async ({ event }) => {
  const accessToken = getBearerAccessToken(event);
  if (!accessToken) {
    return json(401, { message: 'Authorization header is required' });
  }

  try {
    await cognitoClient.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
      }),
    );
    return json(200, { message: 'MFA disabled' });
  } catch (error: any) {
    return mapMfaError(error);
  }
};

/** GET /auth/mfa-status -- whether the signed-in user currently has TOTP MFA enabled. */
export const handleMfaStatus: RouteHandler = async ({ event }) => {
  const accessToken = getBearerAccessToken(event);
  if (!accessToken) {
    return json(401, { message: 'Authorization header is required' });
  }

  try {
    const response = await cognitoClient.send(
      new GetUserCommand({ AccessToken: accessToken }),
    );
    const enabled = (response.UserMFASettingList || []).includes('SOFTWARE_TOKEN_MFA');
    return json(200, { enabled });
  } catch (error: any) {
    return mapMfaError(error);
  }
};
