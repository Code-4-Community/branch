import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');

// Presigning is the only AWS call these routes make. Stubbing it keeps the real
// photos.ts logic under test -- the extension allowlist and the key layout --
// without needing credentials.
const mockGetSignedUrl = jest.fn() as any;
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

// Only `authenticateRequest` is mocked: the route guards call the real
// `checkAuthorization` out of @branch/lambda-auth, so ADMIN_OR_SELF is exercised
// for real against the identity these tests supply.

function getEvent(path: string, queryStringParameters?: Record<string, string>) {
  return {
    rawPath: path,
    requestContext: { http: { method: 'GET' } },
    queryStringParameters,
  };
}

function mockSelfAuth(userId = 1) {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: { cognitoSub: `sub-${userId}`, userId, email: 'user@example.com', isAdmin: false },
  } as any);
}

function mockUserRow(row: Record<string, unknown>) {
  mockDb.selectFrom.mockReturnValue({
    where: jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
        executeTakeFirst: (jest.fn() as any).mockResolvedValue(row),
      }),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSignedUrl.mockResolvedValue('https://s3.example/signed');
});

describe('GET /users/{userId}/photo-upload-url', () => {
  test('returns a presigned PUT and the key to store', async () => {
    mockSelfAuth(1);

    const res: any = await handler(getEvent('/1/photo-upload-url', { fileName: 'me.PNG' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.uploadUrl).toBe('https://s3.example/signed');
    expect(body.contentType).toBe('image/png');
    // Keyed by user and timestamped; the client's file name is not interpolated.
    expect(body.key).toMatch(/^avatars\/1\/\d+\.png$/);
  });

  test('maps jpg to image/jpeg', async () => {
    mockSelfAuth(1);

    const res: any = await handler(getEvent('/1/photo-upload-url', { fileName: 'me.jpg' }));
    expect(JSON.parse(res.body).contentType).toBe('image/jpeg');
  });

  test('rejects a file type the browser will not render inline', async () => {
    mockSelfAuth(1);

    const res: any = await handler(getEvent('/1/photo-upload-url', { fileName: 'notes.pdf' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Unsupported image type');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test('requires fileName', async () => {
    mockSelfAuth(1);

    const res: any = await handler(getEvent('/1/photo-upload-url'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('fileName is required');
  });

  test('will not presign an upload for another user', async () => {
    mockSelfAuth(1);

    const res: any = await handler(getEvent('/2/photo-upload-url', { fileName: 'me.png' }));
    expect(res.statusCode).toBe(403);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test('rejects an unauthenticated caller', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);

    const res: any = await handler(getEvent('/1/photo-upload-url', { fileName: 'me.png' }));
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /users/{userId} profileImage', () => {
  function patchEvent(userId: string | number, body: unknown) {
    return {
      rawPath: `/${userId}`,
      requestContext: { http: { method: 'PATCH' } },
      body: JSON.stringify(body),
    };
  }

  function mockPatchTarget(userId: number) {
    mockDb.selectFrom.mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue({
            user_id: userId,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            is_admin: false,
            profile_image: null,
            created_at: null,
          }),
        }),
      }),
    });
    mockDb.updateTable.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          execute: (jest.fn() as any).mockResolvedValue(undefined),
        }),
      }),
    });
  }

  test('accepts a key this service minted for the same user', async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    const res: any = await handler(
      patchEvent(1, { profileImage: 'avatars/1/1700000000000.png' }),
    );
    expect(res.statusCode).toBe(200);
  });

  test("refuses another user's photo key", async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    // Presigned on read, so storing someone else's key would hand back a
    // readable URL for their object.
    const res: any = await handler(
      patchEvent(1, { profileImage: 'avatars/2/1700000000000.png' }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('profileImage is not a photo key for this user');
  });

  test('refuses a traversal dressed up as an avatar key', async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    const res: any = await handler(
      patchEvent(1, { profileImage: 'avatars/1/../../receipts/9/secret.pdf' }),
    );
    expect(res.statusCode).toBe(400);
  });

  test('still accepts an absolute URL, which is how the column used to be filled', async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    const res: any = await handler(
      patchEvent(1, { profileImage: 'https://elsewhere.example/ada.png' }),
    );
    expect(res.statusCode).toBe(200);
  });

  test('refuses an unrelated S3 key rather than storing junk', async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    const res: any = await handler(patchEvent(1, { profileImage: 'receipts/9/secret.pdf' }));
    expect(res.statusCode).toBe(400);
  });

  test('refuses an avatar key with an unexpected extension', async () => {
    mockSelfAuth(1);
    mockPatchTarget(1);

    const res: any = await handler(patchEvent(1, { profileImage: 'avatars/1/1.pdf' }));
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users/{userId}', () => {
  test('presigns a stored photo key and returns created_at', async () => {
    mockSelfAuth(1);
    mockUserRow({
      user_id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      is_admin: false,
      profile_image: 'avatars/1/1700000000000.png',
      created_at: '2024-03-04T00:00:00.000Z',
    });

    const res: any = await handler(getEvent('/1'));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body).body;
    // The bucket blocks public access, so the raw key would not load in an <img>.
    expect(body.profile_image).toBe('https://s3.example/signed');
    expect(body.created_at).toBe('2024-03-04T00:00:00.000Z');
  });

  test('passes an absolute URL through without presigning it', async () => {
    mockSelfAuth(1);
    mockUserRow({
      user_id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      is_admin: false,
      profile_image: 'https://elsewhere.example/ada.png',
      created_at: null,
    });

    const res: any = await handler(getEvent('/1'));

    expect(JSON.parse(res.body).body.profile_image).toBe('https://elsewhere.example/ada.png');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test('leaves a missing photo as null', async () => {
    mockSelfAuth(1);
    mockUserRow({
      user_id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      is_admin: false,
      profile_image: null,
      created_at: null,
    });

    const res: any = await handler(getEvent('/1'));

    expect(JSON.parse(res.body).body.profile_image).toBeNull();
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});
