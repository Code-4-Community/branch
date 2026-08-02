/**
 * Covers every Cognito SDK interaction in the auth lambda. The pre-existing
 * auth.unit.test.ts only reaches code paths that return *before* any SDK call,
 * which is why the login hang (a challenge with no registered callback never
 * resolving its promise) shipped unnoticed.
 */
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  // Keep the real command classes so mockSend.mock.calls[n][0].input is
  // assertable and constructor-level input validation still runs.
  const actual = jest.requireActual('@aws-sdk/client-cognito-identity-provider');
  return {
    ...actual,
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  };
});

const mockAuthenticateRequest = jest.fn();
jest.mock('../auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockExecuteTakeFirst = jest.fn();
const mockExecute = jest.fn();
const mockSet = jest.fn();
const mockValues = jest.fn();

jest.mock('../db', () => {
  const selectChain: any = {
    where: () => selectChain,
    selectAll: () => selectChain,
    select: () => selectChain,
    executeTakeFirst: (...a: unknown[]) => mockExecuteTakeFirst(...a),
  };
  const updateChain: any = {
    set: (...a: unknown[]) => {
      mockSet(...a);
      return updateChain;
    },
    where: () => updateChain,
    execute: (...a: unknown[]) => mockExecute(...a),
  };
  const insertChain: any = {
    values: (...a: unknown[]) => {
      mockValues(...a);
      return insertChain;
    },
    execute: (...a: unknown[]) => mockExecute(...a),
  };
  return {
    __esModule: true,
    default: {
      selectFrom: () => selectChain,
      updateTable: () => updateChain,
      insertInto: () => insertChain,
    },
  };
});

import { handler } from '../handler';

function event(path: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    body: body ? JSON.stringify(body) : undefined,
    headers: headers ?? {},
  };
}

/** Builds a rejection that looks like an AWS SDK service error. */
function cognitoError(name: string, message = name) {
  return Object.assign(new Error(message), { name });
}

const TOKENS = {
  AccessToken: 'access-tok',
  IdToken: 'id-tok',
  RefreshToken: 'refresh-tok',
  ExpiresIn: 3600,
  TokenType: 'Bearer',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('POST /login', () => {
  it('returns the token set on success', async () => {
    mockSend.mockResolvedValue({ AuthenticationResult: TOKENS });

    const res = await handler(event('/login', 'POST', { email: 'a@b.com', password: 'Pw' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      AccessToken: 'access-tok',
      IdToken: 'id-tok',
      RefreshToken: 'refresh-tok',
      ExpiresIn: 3600,
      TokenType: 'Bearer',
    });
  });

  it('uses USER_PASSWORD_AUTH with a lowercased username and no SECRET_HASH', async () => {
    mockSend.mockResolvedValue({ AuthenticationResult: TOKENS });

    await handler(event('/login', 'POST', { email: 'MiXeD@Case.COM', password: 'Pw' }));

    const { input } = mockSend.mock.calls[0][0];
    expect(input.AuthFlow).toBe('USER_PASSWORD_AUTH');
    expect(input.AuthParameters.USERNAME).toBe('mixed@case.com');
    expect(input.AuthParameters.PASSWORD).toBe('Pw');
    expect(input.AuthParameters).not.toHaveProperty('SECRET_HASH');
  });

  it.each([
    ['NEW_PASSWORD_REQUIRED'],
    ['SOFTWARE_TOKEN_MFA'],
    ['SMS_MFA'],
    ['EMAIL_OTP'],
    ['SELECT_MFA_TYPE'],
    // The important one: an unmodelled challenge must still resolve. Under the
    // old callback-based implementation this hung for the full 30s timeout.
    ['SOME_FUTURE_CHALLENGE'],
  ])(
    'returns 200 with ChallengeName + Session for %s instead of hanging',
    async (challengeName) => {
      mockSend.mockResolvedValue({
        ChallengeName: challengeName,
        Session: 'sess-1',
        ChallengeParameters: { USER_ID_FOR_SRP: 'a@b.com' },
      });

      const res = await handler(event('/login', 'POST', { email: 'a@b.com', password: 'Pw' }));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ChallengeName).toBe(challengeName);
      expect(body.Session).toBe('sess-1');
      expect(body.AccessToken).toBeUndefined();
    },
    // Short timeout so a regression fails fast rather than stalling the suite.
    2000,
  );

  it('returns 403 for MFA_SETUP but still hands back the Session', async () => {
    mockSend.mockResolvedValue({ ChallengeName: 'MFA_SETUP', Session: 'sess-setup' });

    const res = await handler(event('/login', 'POST', { email: 'a@b.com', password: 'Pw' }));

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.ChallengeName).toBe('MFA_SETUP');
    expect(body.Session).toBe('sess-setup');
  });

  it('returns 500 when Cognito returns neither a result nor a challenge', async () => {
    mockSend.mockResolvedValue({});

    const res = await handler(event('/login', 'POST', { email: 'a@b.com', password: 'Pw' }));

    expect(res.statusCode).toBe(500);
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await handler({
      rawPath: '/login',
      requestContext: { http: { method: 'POST' } },
      body: '{not json',
      headers: {},
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Invalid JSON in request body');
  });

  it.each([
    ['NotAuthorizedException', 401, 'Invalid email or password'],
    ['UserNotFoundException', 401, 'Invalid email or password'],
    ['UserNotConfirmedException', 403, 'Email not verified'],
    ['PasswordResetRequiredException', 403, 'Password reset required'],
    ['TooManyRequestsException', 429, 'Too many attempts, please try again later'],
    ['LimitExceededException', 429, 'Too many attempts, please try again later'],
    ['TooManyFailedAttemptsException', 429, 'Too many attempts, please try again later'],
    ['ForbiddenException', 403, 'Request blocked'],
    ['SomethingElseException', 500, 'Authentication failed'],
  ])('maps %s to %i', async (name, status, message) => {
    mockSend.mockRejectedValue(cognitoError(name));

    const res = await handler(event('/login', 'POST', { email: 'a@b.com', password: 'Pw' }));

    expect(res.statusCode).toBe(status);
    const body = JSON.parse(res.body);
    expect(body.message).toBe(message);
    expect(body.code).toBe(name);
  });
});

describe('POST /respond-challenge', () => {
  it.each([
    [{ session: 's', email: 'a@b.com' }],
    [{ challengeName: 'NEW_PASSWORD_REQUIRED', email: 'a@b.com' }],
    [{ challengeName: 'NEW_PASSWORD_REQUIRED', session: 's' }],
  ])('returns 400 when a required top-level field is missing (%p)', async (body) => {
    const res = await handler(event('/respond-challenge', 'POST', body));

    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 and lists supported challenges for an unknown challengeName', async () => {
    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NOPE',
        session: 's',
        email: 'a@b.com',
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).supported).toEqual(
      expect.arrayContaining(['NEW_PASSWORD_REQUIRED', 'SOFTWARE_TOKEN_MFA']),
    );
  });

  it('returns 400 when NEW_PASSWORD_REQUIRED omits newPassword', async () => {
    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: 's',
        email: 'a@b.com',
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('newPassword is required');
  });

  it('returns 400 for a weak newPassword before calling Cognito', async () => {
    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: 's',
        email: 'a@b.com',
        newPassword: 'short',
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('completes NEW_PASSWORD_REQUIRED and returns tokens', async () => {
    mockSend.mockResolvedValue({ AuthenticationResult: TOKENS });

    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: 'sess-1',
        email: 'A@B.com',
        newPassword: 'NewPassword123',
        name: 'Jane Doe',
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).AccessToken).toBe('access-tok');

    const { input } = mockSend.mock.calls[0][0];
    expect(input.ChallengeName).toBe('NEW_PASSWORD_REQUIRED');
    expect(input.Session).toBe('sess-1');
    expect(input.ChallengeResponses).toEqual({
      USERNAME: 'a@b.com',
      NEW_PASSWORD: 'NewPassword123',
      'userAttributes.name': 'Jane Doe',
    });
  });

  it('maps a TOTP code to SOFTWARE_TOKEN_MFA_CODE', async () => {
    mockSend.mockResolvedValue({ AuthenticationResult: TOKENS });

    await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'SOFTWARE_TOKEN_MFA',
        session: 'sess-1',
        email: 'a@b.com',
        code: '123456',
      }),
    );

    expect(mockSend.mock.calls[0][0].input.ChallengeResponses).toEqual({
      USERNAME: 'a@b.com',
      SOFTWARE_TOKEN_MFA_CODE: '123456',
    });
  });

  it('chains: returns the next challenge when Cognito issues another one', async () => {
    mockSend.mockResolvedValue({ ChallengeName: 'MFA_SETUP', Session: 'sess-2' });

    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: 'sess-1',
        email: 'a@b.com',
        newPassword: 'NewPassword123',
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ChallengeName).toBe('MFA_SETUP');
  });

  it('maps an expired challenge session to 401', async () => {
    mockSend.mockRejectedValue(cognitoError('NotAuthorizedException'));

    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: 'stale',
        email: 'a@b.com',
        newPassword: 'NewPassword123',
      }),
    );

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toContain('sign in again');
  });

  it('maps a wrong MFA code to 400', async () => {
    mockSend.mockRejectedValue(cognitoError('CodeMismatchException'));

    const res = await handler(
      event('/respond-challenge', 'POST', {
        challengeName: 'SOFTWARE_TOKEN_MFA',
        session: 's',
        email: 'a@b.com',
        code: '000000',
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Invalid verification code');
  });
});

describe('POST /refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await handler(event('/refresh', 'POST', {}));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('refreshToken is required');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('uses REFRESH_TOKEN_AUTH and returns new access and ID tokens', async () => {
    // Cognito does not re-issue a refresh token on this flow.
    mockSend.mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'new-access',
        IdToken: 'new-id',
        ExpiresIn: 3600,
        TokenType: 'Bearer',
      },
    });

    const res = await handler(event('/refresh', 'POST', { refreshToken: 'r-tok' }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.AccessToken).toBe('new-access');
    expect(body.IdToken).toBe('new-id');
    expect(body.RefreshToken).toBeUndefined();

    const { input } = mockSend.mock.calls[0][0];
    expect(input.AuthFlow).toBe('REFRESH_TOKEN_AUTH');
    expect(input.AuthParameters).toEqual({ REFRESH_TOKEN: 'r-tok' });
  });

  it('returns 401 for an expired refresh token', async () => {
    mockSend.mockRejectedValue(cognitoError('NotAuthorizedException'));

    const res = await handler(event('/refresh', 'POST', { refreshToken: 'stale' }));

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Refresh token is invalid or expired');
  });

  it('returns 401 when Cognito responds without an AuthenticationResult', async () => {
    mockSend.mockResolvedValue({});

    const res = await handler(event('/refresh', 'POST', { refreshToken: 'r-tok' }));

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /me', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });

    const res = await handler(event('/me', 'GET'));

    expect(res.statusCode).toBe(401);
    expect(mockExecuteTakeFirst).not.toHaveBeenCalled();
  });

  it('returns 401 when the token verifies but no branch.users row exists', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: { cognitoSub: 'sub-1', isAdmin: false },
    });
    mockExecuteTakeFirst.mockResolvedValue(undefined);

    const res = await handler(event('/me', 'GET'));

    expect(res.statusCode).toBe(401);
  });

  it('sources isAdmin from the database row, not the auth context', async () => {
    // Regression guard: /auth/me is the only place the frontend can learn
    // isAdmin, and it must reflect branch.users rather than any token claim.
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: { cognitoSub: 'sub-1', isAdmin: false },
    });
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 7,
      cognito_sub: 'sub-1',
      email: 'a@b.com',
      name: 'Ada',
      is_admin: true,
      profile_image: null,
    });

    const res = await handler(event('/me', 'GET', undefined, { Authorization: 'Bearer t' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      userId: 7,
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      name: 'Ada',
      isAdmin: true,
      profileImage: null,
    });
  });

  it('coerces a non-boolean is_admin to false', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: { cognitoSub: 'sub-1', isAdmin: true },
    });
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 7,
      cognito_sub: 'sub-1',
      email: 'a@b.com',
      name: 'Ada',
      is_admin: null,
      profile_image: null,
    });

    const res = await handler(event('/me', 'GET'));

    expect(JSON.parse(res.body).isAdmin) .toBe(false);
  });
});

describe('POST /register — claim-on-register', () => {
  const validBody = { email: 'Ashley@branch.org', password: 'Password123', name: 'Ashley' };

  /** An admin-created invitation: the row exists, but no Cognito identity yet. */
  const invitation = {
    user_id: 1,
    email: 'ashley@branch.org',
    cognito_sub: null,
    is_admin: true,
  };

  it('claims a pending invitation (cognito_sub IS NULL) instead of returning 409', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 1,
      email: 'ashley@branch.org',
      cognito_sub: null,
      is_admin: true,
    });
    mockSend.mockResolvedValue({ UserSub: 'new-sub' });
    mockExecute.mockResolvedValue(undefined);

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).claimed).toBe(true);
    // Updated, not inserted — the row keeps its user_id and is_admin.
    expect(mockSet).toHaveBeenCalledWith({ cognito_sub: 'new-sub', name: 'Ashley' });
    expect(mockValues).not.toHaveBeenCalled();
  });

  it('never writes is_admin when claiming, so a public endpoint cannot grant admin', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 1,
      email: 'ashley@branch.org',
      cognito_sub: null,
      is_admin: true,
    });
    mockSend.mockResolvedValue({ UserSub: 'new-sub' });
    mockExecute.mockResolvedValue(undefined);

    await handler(event('/register', 'POST', validBody));

    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('is_admin');
  });

  it('returns 409 without calling Cognito when the row is already claimed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 1,
      email: 'ashley@branch.org',
      cognito_sub: 'existing-sub',
    });

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses to create an account for an uninvited email', async () => {
    // Registration is invitation-only. This endpoint is public, so without the
    // gate anyone on the internet could mint themselves a working account --
    // and several list endpoints authorize on `isAuthenticated` alone.
    mockExecuteTakeFirst.mockResolvedValue(undefined);

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('INVITATION_REQUIRED');
    // No Cognito user and no DB row: nothing is created at all.
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('does not reveal whether an uninvited email is known', async () => {
    // Same response shape for an unknown address as for a known-but-uninvited
    // one, so /register cannot be used to enumerate staff email addresses.
    mockExecuteTakeFirst.mockResolvedValue(undefined);

    const unknown = await handler(
      event('/register', 'POST', { ...validBody, email: 'stranger@example.com' }),
    );

    expect(unknown.statusCode).toBe(403);
    expect(JSON.parse(unknown.body).message).not.toMatch(/not found|no such|unknown/i);
  });

  it('rolls back the Cognito user when the database write fails', async () => {
    mockExecuteTakeFirst.mockResolvedValue(invitation);
    mockSend
      .mockResolvedValueOnce({ UserSub: 'new-sub' }) // SignUp
      .mockResolvedValueOnce({}); // AdminDeleteUser
    mockExecute.mockRejectedValue(new Error('db down'));

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(500);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].input).toEqual(
      expect.objectContaining({ Username: 'ashley@branch.org' }),
    );
  });

  it('links an existing Cognito user when the DB row is an unclaimed invitation', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 1,
      email: 'ashley@branch.org',
      cognito_sub: null,
    });
    mockSend
      .mockRejectedValueOnce(cognitoError('UsernameExistsException')) // SignUp
      .mockResolvedValueOnce({
        UserStatus: 'CONFIRMED',
        UserAttributes: [{ Name: 'sub', Value: 'orphan-sub' }],
      }); // AdminGetUser
    mockExecute.mockResolvedValue(undefined);

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).claimed).toBe(true);
    expect(mockSet).toHaveBeenCalledWith({ cognito_sub: 'orphan-sub' });
  });

  it('falls back to 409 when the orphan link cannot be completed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      user_id: 1,
      email: 'ashley@branch.org',
      cognito_sub: null,
    });
    mockSend
      .mockRejectedValueOnce(cognitoError('UsernameExistsException'))
      // No AWS credentials locally, so AdminGetUser is SigV4-signed and fails.
      .mockRejectedValueOnce(cognitoError('AccessDeniedException'));

    const res = await handler(event('/register', 'POST', validBody));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('COGNITO_USER_EXISTS');
  });

  it('rejects a weak password before touching the database', async () => {
    const res = await handler(
      event('/register', 'POST', { ...validBody, password: 'nouppercase1' }),
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('uppercase');
    expect(mockExecuteTakeFirst).not.toHaveBeenCalled();
  });
});
