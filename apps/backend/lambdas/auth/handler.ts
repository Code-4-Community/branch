import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  SignUpCommandInput,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  InitiateAuthCommandOutput,
  RespondToAuthChallengeCommand,
  RespondToAuthChallengeCommandOutput,
  ConfirmSignUpCommand,
  ConfirmSignUpCommandInput,
  ResendConfirmationCodeCommand,

  GlobalSignOutCommand,
  GlobalSignOutCommandInput,
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
  AuthenticationResultType,
  ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';
import { authenticateRequest } from './auth';
import db from './db';

// Initialize Cognito client (region defaults to us-east-2)
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const USER_POOL_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

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

const CHALLENGE_SPECS: Record<string, ChallengeSpec> = {
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

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const fullPath = event.rawPath || event.path || '/';
    // API Gateway mounts this service at /auth[/{proxy+}]; strip the mount
    // prefix so routing below (rawPath and normalizedPath) sees the bare path.
    const rawPath = fullPath.replace(/^\/auth(?=\/|$)/, '') || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return json(200, {});
    }

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    
    // POST /register
    if (normalizedPath === '/register' && method === 'POST') {
      return await handleRegister(event);
    }

    
    // POST /login
    if (normalizedPath === '/login' && method === 'POST') {
      return await handleLogin(event);
    }

    // POST /respond-challenge
    if (normalizedPath === '/respond-challenge' && method === 'POST') {
      return await handleRespondChallenge(event);
    }

    // POST /refresh
    if (normalizedPath === '/refresh' && method === 'POST') {
      return await handleRefresh(event);
    }

    // GET /me
    if (normalizedPath === '/me' && method === 'GET') {
      return await handleMe(event);
    }

    // POST /verify-email
    if (normalizedPath === '/verify-email' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email, code } = body;
      if (!email || !code) {
        return json(400, { message: 'email and code are required' });
      }
      const params: ConfirmSignUpCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: email as string,
        ConfirmationCode: code as string,
      };
      try {
        await cognitoClient.send(new ConfirmSignUpCommand(params));
      } catch (error: any) {
        console.error('Email verification error:', error);
        if (error.name === 'NotAuthorizedException' && error.message?.includes('CONFIRMED')) {
          return json(200, { message: `Email already verified for ${email}` });
        }
        if (error.name === 'CodeMismatchException' || error.name === 'ExpiredCodeException') {
          return json(400, { message: 'Invalid or expired verification code' });
        }
        if (error.name === 'UserNotFoundException') {
          return json(400, { message: 'Invalid code or email' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many attempts, please try again later' });
        }
        return json(500, { message: 'Failed to verify email' });
      }
      return json(200, { message: `Email verified successfully for ${email}` });
    }

    // POST /resend-code
    if (normalizedPath === '/resend-code' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email } = body;
      if (!email) {
        return json(400, { message: 'email is required' });
      }
      try {
        await cognitoClient.send(new ResendConfirmationCodeCommand({
          ClientId: USER_POOL_CLIENT_ID,
          Username: email as string,
        }));
        return json(200, { message: `Verification code resent to ${email}` });
      } catch (error: any) {
        if (error.name === 'UserNotFoundException') {
          return json(404, { message: 'User not found' });
        }
        if (error.name === 'InvalidParameterException') {
          return json(400, { message: 'User is already confirmed' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many attempts, please try again later' });
        }
        console.error('Resend code error:', error);
        return json(500, { message: 'Failed to resend verification code' });
      }
    }
    
    // POST /logout
    if (normalizedPath === '/logout' && method === 'POST') {
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

        return json(500, { message: 'Failed to logout' });
      }
    }
    
    // POST /forgot-password
    if (normalizedPath === '/forgot-password' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email } = body;
      if (!email) {
        return json(400, { message: 'email is required' });
      }

      const params: ForgotPasswordCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: (email as string).toLowerCase(),
      };

      try {
        const response = await cognitoClient.send(new ForgotPasswordCommand(params));
        return json(200, {
          message: 'Password reset code sent',
          deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
          destination: response.CodeDeliveryDetails?.Destination,
        });
      } catch (error: any) {
        console.error('Forgot password error:', error);
        if (error.name === 'UserNotFoundException') {
          // Don't reveal whether the user exists
          return json(200, { message: 'If an account with that email exists, a reset code has been sent' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many requests, please try again later' });
        }
        if (error.name === 'InvalidParameterException') {
          return json(400, { message: 'Cannot reset password for unverified email. Please verify your email first.' });
        }
        return json(500, { message: 'Failed to initiate password reset' });
      }
    }
    
    // POST /reset-password
    if (normalizedPath === '/reset-password' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email, code, newPassword } = body;
      if (!email || !code || !newPassword) {
        return json(400, { message: 'email, code, and newPassword are required' });
      }

      const params: ConfirmForgotPasswordCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: (email as string).toLowerCase(),
        ConfirmationCode: code as string,
        Password: newPassword as string,
      };

      try {
        await cognitoClient.send(new ConfirmForgotPasswordCommand(params));
        return json(200, { message: 'Password reset successfully' });
      } catch (error: any) {
        console.error('Reset password error:', error);
        if (error.name === 'CodeMismatchException') {
          return json(400, { message: 'Invalid verification code' });
        }
        if (error.name === 'ExpiredCodeException') {
          return json(400, { message: 'Verification code has expired, please request a new one' });
        }
        if (error.name === 'InvalidPasswordException') {
          return json(400, { message: 'Password does not meet requirements (min 8 chars, uppercase, lowercase, number)' });
        }
        if (error.name === 'UserNotFoundException') {
          return json(400, { message: 'Invalid email or code' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many attempts, please try again later' });
        }
        return json(500, { message: 'Failed to reset password' });
      }
    }
    // <<< ROUTES-END       

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

/** Parses a JSON body, returning null when it is not valid JSON. */
function parseBody(event: any): Record<string, unknown> | null {
  try {
    return event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/**
 * Password rules, kept in one place so /register and /respond-challenge cannot
 * drift. Returns an error message, or null when the password is acceptable.
 * Mirrors the pool's password_policy in infrastructure/aws/cognito.tf.
 */
function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

/** 200 + the token set. Shape matches what the frontend AuthContext expects. */
function authResultResponse(result: AuthenticationResultType): APIGatewayProxyResult {
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
function challengeResponse(
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
function mapCognitoAuthError(
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
      return json(500, { message: 'Authentication failed', error: error?.message, code });
  }
}

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
async function handleLogin(event: any): Promise<APIGatewayProxyResult> {
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

    return json(500, { message: 'Unexpected response from authentication service' });
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
async function handleRespondChallenge(event: any): Promise<APIGatewayProxyResult> {
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
    return json(500, { message: 'Unexpected response from authentication service' });
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
async function handleRefresh(event: any): Promise<APIGatewayProxyResult> {
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
async function handleMe(event: any): Promise<APIGatewayProxyResult> {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }

  const me = await db
    .selectFrom('branch.users')
    .where('cognito_sub', '=', authContext.user.cognitoSub)
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
    profileImage: me.profile_image,
  });
}

async function handleRegister(event: any): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return json(400, {
        message: 'Missing required fields',
        required: ['email', 'password', 'name'],
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json(400, { message: 'Invalid email format' });
    }

    // Validate password requirements
    const passwordError = validatePassword(password);
    if (passwordError) {
      return json(400, { message: passwordError });
    }

    // Validate name
    if (name.trim().length < 2) {
      return json(400, { message: 'Name must be at least 2 characters long' });
    }

    // A branch.users row with cognito_sub IS NULL is a PENDING INVITATION, not a
    // conflict. Two paths create them: the db/seed.sql rows and admin
    // POST /users. Before claim-on-register both were permanently unable to sign
    // in -- registration 409'd on the email, and lambda-auth's authenticateRequest
    // can never match a NULL cognito_sub.
    const existingUser = await db
      .selectFrom('branch.users')
      .where('email', '=', email.toLowerCase())
      .selectAll()
      .executeTakeFirst();

    if (existingUser && existingUser.cognito_sub) {
      return json(409, { message: 'User with this email already exists' });
    }

    // REGISTRATION IS INVITATION-ONLY. This endpoint is public and
    // unauthenticated, so without this gate anyone could create a working
    // account for themselves. An account is only meaningful once a branch.users
    // row exists -- authenticateRequest rejects any Cognito identity whose sub
    // has no row -- so refusing to create that row here is the control.
    //
    // The invitation must be created first by an admin via the ADMIN-gated
    // POST /users, which inserts a row with a NULL cognito_sub.
    //
    // 403 rather than 404: this endpoint must not become an oracle for which
    // email addresses have been invited, so the response is deliberately the
    // same whether or not the address is known.
    if (!existingUser) {
      return json(403, {
        message:
          'Registration is by invitation only. Ask an administrator to create your account.',
        code: 'INVITATION_REQUIRED',
      });
    }

    const claimingUserId: number = existingUser.user_id;

    // Prepare Cognito SignUp parameters
    const signUpParams: SignUpCommandInput = {
      ClientId: USER_POOL_CLIENT_ID,
      Username: email.toLowerCase(),
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email.toLowerCase(),
        },
        {
          Name: 'name',
          Value: name.trim(),
        },
      ],
    };

    // Register user in Cognito
    let cognitoUserSub: string;
    try {
      const command = new SignUpCommand(signUpParams);
      const response = await cognitoClient.send(command);
      cognitoUserSub = response.UserSub!;
    } catch (error: any) {
      console.error('Cognito registration error:', error);

      // Handle specific Cognito errors
      if (error.name === 'UsernameExistsException') {
        // The Cognito user exists but this DB row is an unclaimed invitation, so
        // SignUp can never hand us a sub. Happens routinely in local dev: `make
        // down-v` wipes Postgres while the shared dev pool keeps the user. Link
        // the existing Cognito identity instead of dead-ending on a 409.
        {
          try {
            // AdminGetUser is SigV4-signed and needs cognito-idp:AdminGetUser
            // (granted in infrastructure/aws/lambda.tf). With no AWS credentials
            // locally this throws and we fall through to the 409.
            const cognitoUser = await cognitoClient.send(
              new AdminGetUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: email.toLowerCase(),
              }),
            );
            const sub = cognitoUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
            if (sub && cognitoUser.UserStatus === 'CONFIRMED') {
              await db
                .updateTable('branch.users')
                .set({ cognito_sub: sub })
                .where('user_id', '=', claimingUserId)
                .where('cognito_sub', 'is', null)
                .execute();
              return json(200, {
                message: 'Existing account linked',
                claimed: true,
                email: email.toLowerCase(),
              });
            }
          } catch (linkError) {
            console.warn('Could not auto-link existing Cognito user:', linkError);
          }
        }
        return json(409, {
          message: 'User with this email already exists',
          code: 'COGNITO_USER_EXISTS',
        });
      }
      if (error.name === 'InvalidPasswordException') {
        return json(400, { message: 'Password does not meet requirements' });
      }
      if (error.name === 'InvalidParameterException') {
        return json(400, { message: error.message || 'Invalid parameters provided' });
      }

      return json(500, { message: 'Failed to register user in authentication service' });
    }

    // Create user in database, or claim the pending invitation
    try {
      // Claim the invitation. is_admin is deliberately NOT touched: it was set
      // by whoever created the invitation (a seed, or an admin via POST /users)
      // and must never be settable from a public, unauthenticated endpoint.
      // There is no insert path here -- registration cannot mint a new row, only
      // claim one an admin already approved. The cognito_sub IS NULL predicate
      // makes a concurrent claim a no-op rather than an overwrite;
      // UNIQUE(cognito_sub) is the backstop.
      await db
        .updateTable('branch.users')
        .set({ cognito_sub: cognitoUserSub, name: name.trim() })
        .where('user_id', '=', claimingUserId)
        .where('cognito_sub', 'is', null)
        .execute();
    } catch (dbError: any) {
      console.error('Database insert error:', dbError);

      // Rollback: Delete user from Cognito if database insert fails
      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: email.toLowerCase(),
          })
        );
        console.log('Rolled back Cognito user after database failure');
      } catch (rollbackError) {
        console.error('Failed to rollback Cognito user:', rollbackError);
      }

      return json(500, { message: 'Failed to create user account' });
    }

    return json(201, {
      message: 'User registered successfully',
      userId: cognitoUserSub,
      email: email.toLowerCase(),
      name: name.trim(),
      emailVerificationRequired: true,
      details: 'Please check your email for verification code',
      claimed: true,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return json(500, { message: 'Internal server error during registration' });
  }
}

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
