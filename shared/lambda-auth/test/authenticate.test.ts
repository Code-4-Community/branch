const mockVerify = jest.fn();
const mockCreate = jest.fn(() => ({ verify: mockVerify }));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: (...args: unknown[]) => mockCreate(...(args as [])),
  },
}));

/** A `branch.users` row as the identity query selects it, membership columns included. */
function userRow(over: Record<string, unknown> = {}) {
  return {
    user_id: 7,
    cognito_sub: 'sub-1',
    email: 'row@b.com',
    name: 'Ada',
    is_admin: false,
    profile_image: null,
    project_id: null,
    role: null,
    ...over,
  };
}

/**
 * Minimal Kysely-shaped stub for the one identity query:
 * selectFrom().leftJoin().where().select().execute()
 *
 * Every call is recorded so a test can assert the join is a LEFT join keyed on
 * cognito_sub -- an inner join here would sign out a user with no memberships.
 * `innerJoin` throws rather than returning a chain, so a regression cannot pass
 * quietly.
 */
function makeDb(rows: unknown[]) {
  const execute = jest.fn().mockResolvedValue(rows);
  const calls: {
    from?: unknown;
    leftJoin?: unknown[];
    where?: unknown[];
    select?: unknown;
  } = {};

  const tail = {
    where: (...args: unknown[]) => {
      calls.where = args;
      return tail;
    },
    select: (columns: unknown) => {
      calls.select = columns;
      return { execute };
    },
  };

  const db = {
    selectFrom: (table: unknown) => {
      calls.from = table;
      return {
        leftJoin: (...args: unknown[]) => {
          calls.leftJoin = args;
          return tail;
        },
        innerJoin: () => {
          throw new Error('inner join would sign out a user with no memberships');
        },
      };
    },
  };

  return { db, execute, calls };
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
    const { db, execute } = makeDb([]);

    await expect(authenticateRequest(db, { headers: {} })).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when verification rejects', async () => {
    mockVerify.mockRejectedValue(new Error('expired'));
    const { authenticateRequest } = await loadModule();
    const { db, execute } = makeDb([]);

    await expect(authenticateRequest(db, bearerEvent('bad'))).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when the token is valid but no branch.users row matches', async () => {
    mockVerify.mockResolvedValue({ sub: 'orphan-sub' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([]);

    await expect(authenticateRequest(db, bearerEvent('good'))).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(console.warn).toHaveBeenCalledWith(
      'User authenticated with Cognito but not found in database:',
      'orphan-sub',
    );
  });

  it('builds the auth context from the DB row', async () => {
    mockVerify.mockResolvedValue({ sub: 'sub-1', email: 'claim@b.com' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([userRow({ is_admin: true })]);

    await expect(authenticateRequest(db, bearerEvent('good'))).resolves.toEqual({
      isAuthenticated: true,
      user: {
        cognitoSub: 'sub-1',
        userId: 7,
        // The JWT claim, deliberately not the column -- see dbUser.email.
        email: 'claim@b.com',
        isAdmin: true,
        cognitoGroups: undefined,
        dbUser: {
          userId: 7,
          cognitoSub: 'sub-1',
          email: 'row@b.com',
          name: 'Ada',
          isAdmin: true,
          profileImage: null,
        },
        memberships: [],
      },
    });
  });

  it('resolves identity and memberships in ONE left-joined query', async () => {
    // The two used to be strictly serial: identity, then memberships keyed on
    // the user_id it returned. That was 2 RTTs on every guarded request.
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db, execute, calls } = makeDb([userRow()]);

    await authenticateRequest(db, bearerEvent('good'));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(calls.from).toBe('branch.users as u');
    expect(calls.leftJoin).toEqual([
      'branch.project_memberships as pm',
      'pm.user_id',
      'u.user_id',
    ]);
    expect(calls.where).toEqual(['u.cognito_sub', '=', 'sub-1']);
    // The union of what authentication and GET /auth/me need, so /auth/me does
    // not re-read the same row for a different column list.
    expect(calls.select).toEqual([
      'u.user_id',
      'u.cognito_sub',
      'u.email',
      'u.name',
      'u.is_admin',
      'u.profile_image',
      'pm.project_id',
      'pm.role',
    ]);
  });

  it('authenticates a user with no memberships and invents none', async () => {
    // The LEFT JOIN hands back one row with NULL membership columns. An inner
    // join would return nothing and sign this user out; a missing NULL check
    // would hand the policy a membership on project `null`.
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([userRow({ project_id: null, role: null })]);

    const ctx = await authenticateRequest(db, bearerEvent('good'));

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user?.memberships).toEqual([]);
  });

  it('collects one membership per joined row and dedupes the identity', async () => {
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([
      userRow({ project_id: 1, role: 'Director' }),
      userRow({ project_id: 2, role: 'Student' }),
      userRow({ project_id: 3, role: 'Admin' }),
    ]);

    const ctx = await authenticateRequest(db, bearerEvent('good'));

    expect(ctx.user?.userId).toBe(7);
    expect(ctx.user?.memberships).toEqual([
      { project_id: 1, role: 'Director' },
      { project_id: 2, role: 'Student' },
      { project_id: 3, role: 'Admin' },
    ]);
  });

  it.each([[false], [null], [undefined], ['true']])(
    'treats is_admin %p as not-admin (strict === true only)',
    async (isAdminValue) => {
      mockVerify.mockResolvedValue({ sub: 'sub-1' });
      const { authenticateRequest } = await loadModule();
      const { db } = makeDb([userRow({ is_admin: isAdminValue })]);

      const ctx = await authenticateRequest(db, bearerEvent('good'));
      expect(ctx.user?.isAdmin).toBe(false);
      expect(ctx.user?.dbUser?.isAdmin).toBe(false);
    },
  );

  it('does NOT promote a member of the Cognito "Admins" group to admin', async () => {
    // Regression guard. branch.users.is_admin is the single source of truth;
    // promoting on a group would make demotion via PATCH /users/{userId}
    // silently ineffective. cognitoGroups stays populated but informational.
    mockVerify.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['Admins'] });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([userRow({ is_admin: false })]);

    const ctx = await authenticateRequest(db, bearerEvent('good'));
    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user?.isAdmin).toBe(false);
    expect(ctx.user?.cognitoGroups).toEqual(['Admins']);
  });

  it('verifies with tokenUse "access" and the configured client id', async () => {
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([userRow()]);

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
    const { db } = makeDb([userRow()]);

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
    const { db } = makeDb([userRow()]);

    await authenticateRequest(db, bearerEvent('good'));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ clientId: null }));
  });

  it('throws (not a silent 401) when COGNITO_USER_POOL_ID is unset', async () => {
    // Swallowing this gave blanket silent 401s across all six lambdas.
    delete process.env.COGNITO_USER_POOL_ID;
    const { authenticateRequest } = await loadModule();
    const { db } = makeDb([userRow({ is_admin: true })]);

    await expect(authenticateRequest(db, bearerEvent('good'))).rejects.toThrow(
      'COGNITO_USER_POOL_ID',
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting it as unauthenticated', async () => {
    // Regression guard for the preview-env outage (PR #316). The query stays
    // outside the try/catch that handles a bad token, so an unreachable RDS
    // surfaces as a 500 rather than logging everyone out.
    mockVerify.mockResolvedValue({ sub: 'sub-1' });
    const { authenticateRequest } = await loadModule();
    const { db, execute } = makeDb([]);
    execute.mockRejectedValue(new Error('timeout exceeded when trying to connect'));

    await expect(authenticateRequest(db, bearerEvent('good'))).rejects.toThrow(
      'timeout exceeded when trying to connect',
    );
  });
});
