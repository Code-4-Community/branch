/**
 * Covers the TOTP MFA enrollment endpoints: /mfa-setup, /mfa-verify,
 * /mfa-disable, /mfa-status. Mirrors auth.login.unit.test.ts's mocking
 * pattern -- real command classes via jest.requireActual so
 * mockSend.mock.calls[n][0].input is assertable, mocked .send/.db.
 */
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const actual = jest.requireActual('@aws-sdk/client-cognito-identity-provider');
  return {
    ...actual,
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  };
});

const mockAuthenticateRequest = jest.fn();
// dispatch() resolves the caller through resolveAuth before the controller
// runs, so the mock has to supply it too. The MFA routes only need the auth
// context (they act on the caller's own Cognito session), so the subject is a
// plain non-admin with no memberships.
jest.mock('../auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  resolveAuth: async (...args: unknown[]) => ({
    context: await mockAuthenticateRequest(...args),
    subject: { userId: 1, isAdmin: false, memberProjectIds: [], directorProjectIds: [] },
  }),
}));

const mockExecuteTakeFirst = jest.fn();

jest.mock('../db', () => {
  const selectChain: any = {
    where: () => selectChain,
    selectAll: () => selectChain,
    select: () => selectChain,
    executeTakeFirst: (...a: unknown[]) => mockExecuteTakeFirst(...a),
  };
  return {
    __esModule: true,
    default: {
      selectFrom: () => selectChain,
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

function cognitoError(name: string, message = name) {
  return Object.assign(new Error(message), { name });
}

const AUTH_HEADERS = { Authorization: 'Bearer access-tok' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: { cognitoSub: 'sub-1', isAdmin: false },
  });
  mockExecuteTakeFirst.mockResolvedValue({ email: 'a@b.com' });
});

afterEach(() => jest.restoreAllMocks());

describe('POST /mfa-setup', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await handler(event('/mfa-setup', 'POST'));

    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls AssociateSoftwareToken with the bearer token and returns the secret + otpauth URL', async () => {
    mockSend.mockResolvedValue({ SecretCode: 'SECRET123' });

    const res = await handler(event('/mfa-setup', 'POST', undefined, AUTH_HEADERS));

    expect(res.statusCode).toBe(200);
    const { input } = mockSend.mock.calls[0][0];
    expect(input.AccessToken).toBe('access-tok');

    const body = JSON.parse(res.body);
    expect(body.secretCode).toBe('SECRET123');
    expect(body.otpauthUrl).toContain('otpauth://totp/');
    expect(body.otpauthUrl).toContain('secret=SECRET123');
    expect(body.otpauthUrl).toContain('issuer=BRANCH');
  });

  it('returns 500 when Cognito responds without a SecretCode', async () => {
    mockSend.mockResolvedValue({});

    const res = await handler(event('/mfa-setup', 'POST', undefined, AUTH_HEADERS));

    expect(res.statusCode).toBe(500);
  });

  it('maps NotAuthorizedException to 401', async () => {
    mockSend.mockRejectedValue(cognitoError('NotAuthorizedException'));

    const res = await handler(event('/mfa-setup', 'POST', undefined, AUTH_HEADERS));

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /mfa-verify', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await handler(event('/mfa-verify', 'POST', { code: '123456' }));

    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 when code is missing', async () => {
    const res = await handler(event('/mfa-verify', 'POST', {}, AUTH_HEADERS));

    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('on Status=SUCCESS, also enables SOFTWARE_TOKEN_MFA as the preferred factor', async () => {
    mockSend
      .mockResolvedValueOnce({ Status: 'SUCCESS' }) // VerifySoftwareToken
      .mockResolvedValueOnce({}); // SetUserMFAPreference

    const res = await handler(event('/mfa-verify', 'POST', { code: '123456' }, AUTH_HEADERS));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('MFA enabled');

    const verifyInput = mockSend.mock.calls[0][0].input;
    expect(verifyInput.AccessToken).toBe('access-tok');
    expect(verifyInput.UserCode).toBe('123456');

    const prefInput = mockSend.mock.calls[1][0].input;
    expect(prefInput.SoftwareTokenMfaSettings).toEqual({ Enabled: true, PreferredMfa: true });
  });

  it('returns 400 and does not enable MFA when Status is not SUCCESS', async () => {
    mockSend.mockResolvedValue({ Status: 'ERROR' });

    const res = await handler(event('/mfa-verify', 'POST', { code: '000000' }, AUTH_HEADERS));

    expect(res.statusCode).toBe(400);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('maps CodeMismatchException to 400', async () => {
    mockSend.mockRejectedValue(cognitoError('CodeMismatchException'));

    const res = await handler(event('/mfa-verify', 'POST', { code: '000000' }, AUTH_HEADERS));

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /mfa-disable', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await handler(event('/mfa-disable', 'POST'));

    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('disables SOFTWARE_TOKEN_MFA', async () => {
    mockSend.mockResolvedValue({});

    const res = await handler(event('/mfa-disable', 'POST', undefined, AUTH_HEADERS));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('MFA disabled');

    const { input } = mockSend.mock.calls[0][0];
    expect(input.SoftwareTokenMfaSettings).toEqual({ Enabled: false, PreferredMfa: false });
  });
});

describe('GET /mfa-status', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await handler(event('/mfa-status', 'GET'));

    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reports enabled: true when SOFTWARE_TOKEN_MFA is in UserMFASettingList', async () => {
    mockSend.mockResolvedValue({ UserMFASettingList: ['SOFTWARE_TOKEN_MFA'] });

    const res = await handler(event('/mfa-status', 'GET', undefined, AUTH_HEADERS));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enabled: true });
  });

  it('reports enabled: false when the list is empty', async () => {
    mockSend.mockResolvedValue({ UserMFASettingList: [] });

    const res = await handler(event('/mfa-status', 'GET', undefined, AUTH_HEADERS));

    expect(JSON.parse(res.body)).toEqual({ enabled: false });
  });
});
