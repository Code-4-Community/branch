/**
 * Regression tests for the PATCH /users/{userId} self-escalation hole.
 *
 * The route is ADMIN_OR_SELF, which intentionally lets a non-admin edit their own
 * row. Before the fix it also wrote body.isAdmin, so any user could PATCH
 * { isAdmin: true } to their own userId and become an admin.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
// Memberships the mocked session should appear to have. Named `mock*` so it can
// be referenced from the jest.mock factory below.
const mockMemberships: Array<{ project_id: number; role: string }> = [];

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. This suite mocks ../db, so
  // the subject is assembled from the auth context and `mockMemberships`
  // instead of being read from Postgres -- same buildSubject either way.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { buildSubject } = jest.requireActual<typeof import('@branch/rbac')>('@branch/rbac');
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(authenticateRequest as never, async (context) =>
      buildSubject(context.user, mockMemberships),
    ),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<
  typeof authenticateRequest
>;

const mockSet = jest.fn();

function patchEvent(userId: string | number, body: unknown) {
  return {
    rawPath: `/${userId}`,
    requestContext: { http: { method: 'PATCH' } },
    body: JSON.stringify(body),
  };
}

function mockDbForPatch() {
  // patchUser is a single UPDATE ... RETURNING, so the row it answers with comes
  // back from the write itself.
  mockSet.mockReturnValue({
    where: jest.fn().mockReturnValue({
      returningAll: jest.fn().mockReturnValue({
        executeTakeFirst: (jest.fn() as any).mockResolvedValue({
          user_id: 2,
          name: 'Regular User',
          email: 'user@example.com',
          is_admin: false,
          profile_image: null,
        }),
      }),
    }),
  });
  mockDb.updateTable.mockReturnValue({ set: mockSet });
}

/** Non-admin, userId 2 — so /2 is "self". */
function mockSelfAuth() {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: { cognitoSub: 'user-123', userId: 2, email: 'user@example.com', isAdmin: false },
  });
}

function mockAdminAuth() {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: { cognitoSub: 'admin-123', userId: 1, email: 'admin@example.com', isAdmin: true },
  });
}

describe('PATCH /users/{userId} — isAdmin is a privilege grant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbForPatch();
  });

  test('403: a non-admin cannot promote themselves to admin', async () => {
    mockSelfAuth();

    const res = await handler(patchEvent(2, { isAdmin: true }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('403: a non-admin cannot set isAdmin false either — the field is admin-only', async () => {
    mockSelfAuth();

    const res = await handler(patchEvent(2, { isAdmin: false }));

    expect(res.statusCode).toBe(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('403: isAdmin is rejected even when bundled with legitimate profile fields', async () => {
    mockSelfAuth();

    const res = await handler(patchEvent(2, { name: 'New Name', isAdmin: true }));

    expect(res.statusCode).toBe(403);
    // Critically, the whole update is refused — no partial write.
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('200: a non-admin can still edit their own profile fields', async () => {
    mockSelfAuth();

    const res = await handler(patchEvent(2, { name: 'New Name' }));

    expect(res.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledWith({ name: 'New Name' });
  });

  test('200: an admin can change isAdmin', async () => {
    mockAdminAuth();

    const res = await handler(patchEvent(2, { isAdmin: true }));

    expect(res.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledWith({ is_admin: true });
  });

  test('200: an admin can demote a user', async () => {
    mockAdminAuth();

    const res = await handler(patchEvent(2, { isAdmin: false }));

    expect(res.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledWith({ is_admin: false });
  });
});
