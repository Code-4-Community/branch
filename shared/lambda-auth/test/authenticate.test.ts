const mockVerify = jest.fn();
const mockCreate = jest.fn(() => ({ verify: mockVerify }));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: (...args: unknown[]) => mockCreate(...(args as [])),
  },
}));

/** Minimal Kysely-shaped stub: selectFrom().where().selectAll().executeTakeFirst() */
function makeDb(row: unknown) {
  const executeTakeFirst = jest.fn().mockResolvedValue(row);
  return {
    db: {
      selectFrom: () => ({
        where: () => ({ selectAll: () => ({ executeTakeFirst }) }),
      }),
    },
    executeTakeFirst,
  };
}

function bearerEvent(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// The module memoizes its verifier and reads process.env lazily, so each test
// gets a fresh module registry.
async function loadModule() {
  let mod: typeof import('../src/authenticate');
  await jest.isolateModulesAsync(async () => {
    mod = await import('../src/authenticate');
  });
  return mod!;
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    COGNITO_USER_POOL_ID: 'us-east-2_test',
    COGNITO_CLIENT_ID: 'client-abc',
  };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('extractToken', () => {
  it('strips a Bearer prefix', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken(bearerEvent('tok123'))).toBe('tok123');
  });

  it('accepts a lowercase authorization header', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken({ headers: { authorization: 'Bearer tok123' } })).toBe('tok123');
  });

  it('is case-insensitive on the Bearer scheme', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken({ headers: { Authorization: 'bearer tok123' } })).toBe('tok123');
  });

  it('returns a bare token unchanged when no scheme is present', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken({ headers: { Authorization: 'tok123' } })).toBe('tok123');
  });

  it('returns the whole value for a malformed 3-part header (documents current behaviour)', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken({ headers: { Authorization: 'Bearer a b' } })).toBe('Bearer a b');
  });

  it('returns null when the header is absent', async () => {
    const { extractToken } = await loadModule();
    expect(extractToken({ headers: {} })).toBeNull();
    expect(extractToken({})).toBeNull();
  });
});

describe('authenticateRequest', () => {
  it('returns unauthenticated without verifying when no token is present', async () => {
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb(undefined);

    await expect(authenticateRequest(db, { headers: {} })).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when verification rejects', async () => {
    mockVerify.mockRejectedValue(new Error('expired'));
    const { authenticateRequest } = await loadModule();
    const { db, executeTakeFirst } = makeDb(undefined);

    await expect(authenticateRequest(db, bearerEvent('bad'))).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(executeTakeFirst).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when the token is valid but no branch.users row matches', async () => {
    mockVerify.mockResolvedValue({ sub: 'orphan-sub' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb(undefined);

    await expect(authenticateRequest(db, bearerEvent('good'))).resolves.toEqual({
      isAuthenticated: false,
    });
  });

  it('builds the auth context from the DB row', async () => {
    mockVerify.mockResolvedValue({ sub: 'sub-1', email: 'a@b.com' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: true });

    await expect(authenticateRequest(db, bearerEvent('good'))).resolves.toEqual({
      isAuthenticated: true,
      user: {
        cognitoSub: 'sub-1',
        userId: 7,
        email: 'a@b.com',
        isAdmin: true,
        cognitoGroups: undefined,
      },
    });
  });

  it.each([[false], [null], [undefined], ['true']])(
    'treats is_admin %p as not-admin (strict === true only)',
    async (isAdminValue) => {
      mockVerify.mockResolvedValue({ sub: 'sub-1' });
      const { authenticateRequest } = await loadModule();
      const { db } = makeDb({ user_id: 7, is_admin: isAdminValue });

      const ctx = await authenticateRequest(db, bearerEvent('good'));
      expect(ctx.user?.isAdmin).toBe(false);
    },
  );

  it('does NOT promote a member of the Cognito "Admins" group to admin', async () => {
    // Regression guard. branch.users.is_admin is the single source of truth;
    // promoting on a group would make demotion via PATCH /users/{userId}
    // silently ineffective. cognitoGroups stays populated but informational.
    mockVerify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['Admins'] });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: false });

    const ctx = await authenticateRequest(db, bearerEvent('good'));
    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user?.isAdmin).toBe(false);
    expect(ctx.user?.cognitoGroups).toEqual(['Admins']);
  });

  it('verifies with tokenUse "access" and the configured client id', async () => {
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: false });

    await authenticateRequest(db, bearerEvent('good'));
    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: 'us-east-2_test',
      tokenUse: 'access',
      clientId: 'client-abc',
    });
  });

  it('falls back to COGNITO_APP_CLIENT_ID when COGNITO_CLIENT_ID is unset', async () => {
    delete process.env.COGNITO_CLIENT_ID;
    process.env.COGNITO_APP_CLIENT_ID = 'legacy-client';
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: false });

    await authenticateRequest(db, bearerEvent('good'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'legacy-client' }),
    );
  });

  it('disables the audience check when no client id is configured', async () => {
    delete process.env.COGNITO_CLIENT_ID;
    delete process.env.COGNITO_APP_CLIENT_ID;
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: false });

    await authenticateRequest(db, bearerEvent('good'));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ clientId: null }));
  });

  it('throws (not a silent 401) when COGNITO_USER_POOL_ID is unset', async () => {
    // Swallowing this gave blanket silent 401s across all six lambdas.
    delete process.env.COGNITO_USER_POOL_ID;
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb({ user_id: 7, is_admin: true });

    await expect(authenticateRequest(db, bearerEvent('good'))).rejects.toThrow(
      'COGNITO_USER_POOL_ID',
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting it as unauthenticated', async () => {
    // Regression guard for the preview-env outage (PR #316).
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const db = {
      selectFrom: () => ({
        where: () => ({
          selectAll: () => ({
            executeTakeFirst: jest
              .fn()
              .mockRejectedValue(new Error('timeout exceeded when trying to connect')),
          }),
        }),
      }),
    };

    await expect(authenticateRequest(db, bearerEvent('good'))).rejects.toThrow(
      'timeout exceeded when trying to connect',
    );
  });
});
