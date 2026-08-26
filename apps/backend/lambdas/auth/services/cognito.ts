import { APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AuthenticationResultType,
  InitiateAuthCommandOutput,
  RespondToAuthChallengeCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, reportError } from '@branch/lambda-http';

// Initialize Cognito client (region defaults to us-east-2)
export const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

export const USER_POOL_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
export const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

/**
 * How to answer each Cognito auth challenge.
 *
 * Adding support for a new challenge type is adding a row here -- no routing,
 * dispatch or flow changes. That is what makes enabling MFA on the user pool a
 * configuration change rather than a code change: SOFTWARE_TOKEN_MFA, SMS_MFA,
 * EMAIL_OTP and SELECT_MFA_TYPE are already wired and become reachable the
 * moment mfa_configuration is turned on in infrastructure/aws/cognito.tf.
 */
interface ChallengeSpec {
  /** Body fields that must be present for this challenge. */
  required: string[];
  /** Builds the Cognito ChallengeResponses map. */
  build: (body: Record<string, unknown>, username: string) => Record<string, string>;
}

export const CHALLENGE_SPECS: Record<string, ChallengeSpec> = {
  NEW_PASSWORD_REQUIRED: {
    required: ['newPassword'],
    build: (body, username) => ({
      USERNAME: username,
      NEW_PASSWORD: String(body.newPassword),
      ...(body.name ? { 'userAttributes.name': String(body.name) } : {}),
    }),
  },
  SOFTWARE_TOKEN_MFA: {
    required: ['code'],
    build: (body, username) => ({
      USERNAME: username,
      SOFTWARE_TOKEN_MFA_CODE: String(body.code),
    }),
  },
  SMS_MFA: {
    required: ['code'],
    build: (body, username) => ({
      USERNAME: username,
      SMS_MFA_CODE: String(body.code),
    }),
  },
  EMAIL_OTP: {
    required: ['code'],
    build: (body, username) => ({
      USERNAME: username,
      EMAIL_OTP_CODE: String(body.code),
    }),
  },
  SELECT_MFA_TYPE: {
    required: ['mfaType'],
    build: (body, username) => ({
      USERNAME: username,
      ANSWER: String(body.mfaType),
    }),
  },
};

/**
 * Password rules, kept in one place so /register and /respond-challenge cannot
 * drift. Returns an error message, or null when the password is acceptable.
 * Mirrors the pool's password_policy in infrastructure/aws/cognito.tf.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

/** 200 + the token set. Shape matches what the frontend AuthContext expects. */
export function authResultResponse(result: AuthenticationResultType): APIGatewayProxyResult {
  return json(200, {
    AccessToken: result.AccessToken,
    IdToken: result.IdToken,
    // Absent on REFRESH_TOKEN_AUTH: Cognito does not re-issue a refresh token.
    RefreshToken: result.RefreshToken,
    ExpiresIn: result.ExpiresIn,
    TokenType: result.TokenType,
  });
}

/**
 * 200 + the challenge to answer next. The opaque Session is valid across
 * processes, so the client can complete it with a separate request to
 * POST /auth/respond-challenge.
 */
export function challengeResponse(
  response: InitiateAuthCommandOutput | RespondToAuthChallengeCommandOutput,
): APIGatewayProxyResult {
  return json(200, {
    ChallengeName: response.ChallengeName,
    Session: response.Session,
    ChallengeParameters: response.ChallengeParameters,
    message: `Additional authentication step required: ${response.ChallengeName}`,
  });
}

/** Single Cognito error -> HTTP mapping, shared by login, challenge and refresh. */
export function mapCognitoAuthError(
  error: any,
  stage: 'login' | 'challenge' | 'refresh',
): APIGatewayProxyResult {
  console.error(`Cognito ${stage} error:`, error);
  const code = error?.name;

  switch (code) {
    case 'NotAuthorizedException': {
      const message =
        stage === 'refresh'
          ? 'Refresh token is invalid or expired'
          : stage === 'challenge'
            ? 'Challenge session is invalid or expired, please sign in again'
            : 'Invalid email or password';
      return json(401, { message, code });
    }
    // prevent_user_existence_errors is ENABLED on the app client, so Cognito
    // normally folds this into NotAuthorizedException. Handled for parity.
    case 'UserNotFoundException':
      return json(401, { message: 'Invalid email or password', code });
    case 'UserNotConfirmedException':
      return json(403, { message: 'Email not verified', code });
    case 'PasswordResetRequiredException':
      return json(403, { message: 'Password reset required', code });
    case 'CodeMismatchException':
      return json(400, { message: 'Invalid verification code', code });
    case 'ExpiredCodeException':
      return json(400, { message: 'Verification code has expired', code });
    case 'InvalidPasswordException':
      return json(400, {
        message:
          'Password does not meet requirements (min 8 chars, uppercase, lowercase, number)',
        code,
      });
    case 'InvalidParameterException':
      return json(400, { message: error?.message || 'Invalid parameters provided', code });
    case 'TooManyRequestsException':
    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
      return json(429, { message: 'Too many attempts, please try again later', code });
    case 'ForbiddenException':
      return json(403, { message: 'Request blocked', code });
    default:
      // Every other arm is an expected Cognito outcome; this one is a genuine
      // failure, and the Sentry layer never sees it because we answer with a
      // 500 instead of throwing.
      reportError(error, { stage, code });
      return json(500, { message: 'Authentication failed', error: error?.message, code });
  }
}
