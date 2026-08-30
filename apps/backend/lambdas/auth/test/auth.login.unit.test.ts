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
// dispatch() resolves the caller through resolveAuth before the controller
// runs, so the mock has to supply it too. GET /auth/me returns whatever subject
// this hands back, which is what the browser then authorizes against.
const mockSubject = { userId: 1, isAdmin: false, memberProjectIds: [] as number[], directorProjectIds: [] as number[] };
jest.mock('../auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  resolveAuth: async (...args: unknown[]) => ({
    context: await mockAuthenticateRequest(...args),
    subject: mockSubject,
  }),
}));

const mockExecuteTakeFirst = jest.fn();
const mockExecute = jest.fn();
const mockUpdateResult = jest.fn();
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
    executeTakeFirst: (...a: unknown[]) => mockUpdateResult(...a),
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
  mockUpdateResult.mockResolvedValue({ numUpdatedRows: 1n });
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

  it('returns 401 when the context carries no branch.users row', async () => {
    // Unreachable today -- authentication rejects a token whose sub has no row.
    // The guard keeps a future refactor from turning a missing row into a 500,
    // and 401-not-404 keeps /me from being a user-existence oracle.
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: { cognitoSub: 'sub-1', isAdmin: false },
    });

    const res = await handler(event('/me', 'GET'));

    expect(res.statusCode).toBe(401);
  });

  it('answers from the row authentication already read, with no query of its own', async () => {
    // Was three round trips: identity, memberships, then this handler
    // re-reading the identity row by the same key for a different column list.
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: {
        cognitoSub: 'sub-1',
        userId: 7,
        isAdmin: true,
        dbUser: {
          userId: 7,
          cognitoSub: 'sub-1',
          email: 'a@b.com',
          name: 'Ada',
          isAdmin: true,
          profileImage: 'https://s3/pic.png',
        },
      },
    });

    const res = await handler(event('/me', 'GET', undefined, { Authorization: 'Bearer t' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      userId: 7,
      cognitoSub: 'sub-1',
      email: 'a@b.com',
      name: 'Ada',
      isAdmin: true,
      profileImage: 'https://s3/pic.png',
      // The authorization subject rides along with identity so the browser can
      // evaluate @branch/rbac without a second round trip.
      rbac: mockSubject,
    });
    expect(mockExecuteTakeFirst).not.toHaveBeenCalled();
  });

  it('reports the email column, not the token email claim', async () => {
    // The two fields are populated from different places on purpose: an access
    // token's claim can be stale or absent, branch.users.email cannot.
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: {
        cognitoSub: 'sub-1',
        userId: 7,
        email: 'stale-claim@b.com',
        isAdmin: false,
        dbUser: {
          userId: 7,
          cognitoSub: 'sub-1',
          email: 'column@b.com',
          name: 'Ada',
          isAdmin: false,
          profileImage: null,
        },
      },
    });

    const res = await handler(event('/me', 'GET'));

    expect(JSON.parse(res.body).email).toBe('column@b.com');
  });

  it('sources isAdmin from the database row', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: {
        cognitoSub: 'sub-1',
        userId: 7,
        isAdmin: false,
        dbUser: {
          userId: 7,
          cognitoSub: 'sub-1',
          email: 'a@b.com',
          name: 'Ada',
          isAdmin: true,
          profileImage: null,
        },
      },
    });

    const res = await handler(event('/me', 'GET'));

    expect(JSON.parse(res.body).isAdmin).toBe(true);
  });
});