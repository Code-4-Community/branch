/**
 * Regression tests for the PATCH /users/{userId} self-escalation hole.
 *
 * The route is ADMIN_OR_SELF, which intentionally lets a non-admin edit their own
 * row. Before the fix it also wrote body.isAdmin, so any user could PATCH
 * { isAdmin: true } to their own userId and become an admin.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest, checkAuthorization } from '../auth';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<
  typeof authenticateRequest
>;
const mockCheckAuthorization = checkAuthorization as jest.MockedFunction<
  typeof checkAuthorization
>;

// Mirrors the real checkAuthorization for the levels this route uses.
mockCheckAuthorization.mockImplementation((authContext, requiredAccess, resourceUserId?) => {
  if (!authContext.isAuthenticated || !authContext.user) {
    return { allowed: false, reason: 'Authentication required' };
  }
  if (requiredAccess === 'ADMIN_OR_SELF') {
    const allowed =
      (authContext.user.isAdmin ?? false) || authContext.user.userId === Number(resourceUserId);
    return { allowed, reason: allowed ? undefined : 'Admin access or resource ownership required' };
  }
  return { allowed: true };
});

const mockSet = jest.fn();

function patchEvent(userId: string | number, body: unknown) {
  return {
    rawPath: `/${userId}`,
    requestContext: { http: { method: 'PATCH' } },
    body: JSON.stringify(body),
  };
}

function mockDbForPatch() {
  mockDb.selectFrom.mockReturnValue({
    where: jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
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

  mockSet.mockReturnValue({
    where: jest.fn().mockReturnValue({
      execute: (jest.fn() as any).mockResolvedValue(undefined),
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
    expect(JSON.parse(res.body).message).toBe('Only an admin can change isAdmin');
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
