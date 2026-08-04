import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// The handler reads RECEIPTS_BUCKET_NAME at module load, so it has to be set
// before the require below -- an `import` would be hoisted above this line.
process.env.RECEIPTS_BUCKET_NAME = 'test-receipts-bucket';
process.env.AWS_REGION = 'us-east-2';

jest.mock('../db');
jest.mock('../auth');
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.example/put'),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { handler } = require('../handler') as typeof import('../handler');
const db = require('../db').default as any;
const { authenticateRequest } = require('../auth') as typeof import('../auth');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner') as {
  getSignedUrl: jest.Mock<(client: unknown, command: unknown) => Promise<string>>;
};
/* eslint-enable @typescript-eslint/no-var-requires */

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const admin = {
  isAuthenticated: true,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};
const staff = {
  isAuthenticated: true,
  user: { cognitoSub: 'staff-sub', userId: 3, email: 'nour@branch.org', isAdmin: false },
};

function uploadUrlEvent(query: Record<string, string> = { fileName: 'receipt.pdf', projectId: '1' }) {
  return {
    rawPath: '/expenditures/upload-url',
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: query,
  } as any;
}

/** A kysely builder stub whose terminal call resolves to `value`. */
function chain(value: any) {
  const p: any = {};
  for (const m of ['select', 'selectAll', 'where']) p[m] = jest.fn().mockReturnValue(p);
  p.executeTakeFirst = jest.fn<() => Promise<any>>().mockResolvedValue(value);
  return p;
}

/** Project 1 exists; the caller holds `role` on it (undefined = no membership). */
function seed(role?: string) {
  db.selectFrom = jest.fn();
  db.selectFrom.mockReturnValueOnce(chain({ project_id: 1 }));
  db.selectFrom.mockReturnValueOnce(chain(role ? { role } : undefined));
}

beforeEach(() => {
  jest.clearAllMocks();
  getSignedUrl.mockResolvedValue('https://signed.example/put');
  mockAuthenticateRequest.mockResolvedValue(admin as any);
  seed();
});

describe('GET /expenditures/upload-url', () => {
  test('200: returns a presigned PUT and the object URL to store as receiptUrl', async () => {
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.uploadUrl).toBe('https://signed.example/put');
    expect(body.objectUrl).toMatch(
      /^https:\/\/test-receipts-bucket\.s3\.us-east-2\.amazonaws\.com\/receipts\/1\/\d+-receipt\.pdf$/,
    );

    const command = getSignedUrl.mock.calls[0][1] as any;
    expect(command.input.Bucket).toBe('test-receipts-bucket');
    expect(command.input.ContentType).toBe('application/pdf');
  });

  test('200: a project member with a spending role is allowed', async () => {
    mockAuthenticateRequest.mockResolvedValue(staff as any);
    seed('Accountant');
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(200);
  });

  test('403: a member without a spending role is refused', async () => {
    mockAuthenticateRequest.mockResolvedValue(staff as any);
    seed('Staff');
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(403);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test('403: a non-member is refused', async () => {
    mockAuthenticateRequest.mockResolvedValue(staff as any);
    seed();
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(403);
  });

  test('401: unauthenticated', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(401);
  });

  test('404: unknown project', async () => {
    db.selectFrom = jest.fn().mockReturnValueOnce(chain(undefined));
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(404);
  });

  test('400: rejects a non-PDF, and anything but a positive integer projectId', async () => {
    expect((await handler(uploadUrlEvent({ fileName: 'receipt.exe', projectId: '1' }))).statusCode).toBe(400);
    seed();
    expect((await handler(uploadUrlEvent({ projectId: '1' } as any))).statusCode).toBe(400);
    seed();
    expect((await handler(uploadUrlEvent({ fileName: 'r.pdf', projectId: '0' }))).statusCode).toBe(400);
    seed();
    expect((await handler(uploadUrlEvent({ fileName: 'r.pdf', projectId: 'abc' }))).statusCode).toBe(400);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test('keeps a traversing filename inside the project prefix', async () => {
    const res = await handler(uploadUrlEvent({ fileName: '../../etc/passwd.pdf', projectId: '1' }));
    expect(res.statusCode).toBe(200);
    const { objectUrl } = JSON.parse(res.body);
    expect(objectUrl).toContain('/receipts/1/');
    expect(objectUrl).not.toContain('..');
    expect(objectUrl).toMatch(/\d+-passwd\.pdf$/);
  });

  test('is matched before GET /expenditures/{id}, which would read it as an id', async () => {
    const res = await handler(uploadUrlEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBeUndefined();
  });

  test('500: unconfigured bucket fails loudly rather than signing against ""', async () => {
    // Re-require the handler with the env var absent -- it is captured once, at
    // module load. isolateModules' callback is synchronous, so the request is
    // awaited outside it rather than returned from it.
    let unconfigured!: typeof import('../handler');
    delete process.env.RECEIPTS_BUCKET_NAME;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      unconfigured = require('../handler');
    });
    process.env.RECEIPTS_BUCKET_NAME = 'test-receipts-bucket';

    const res = await unconfigured.handler(uploadUrlEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('Receipt uploads are not configured');
  });
});
