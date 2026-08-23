/**
 * Regression tests for the unguarded DELETE /projects/{id}.
 *
 * The route sat behind a stale "TODO: requireAuth needs to be added here once
 * ticket #241 is completed" long after #241 merged, so the handler's global gate
 * established authentication but nothing checked authorization: any authenticated
 * user — including a Student member of an unrelated project — could delete any
 * project, cascading away its memberships, donations, expenditures and reports.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockAuthenticateRequest = jest.fn();
// The subject dispatch will authorize against. `project:delete` is declared on
// the route, so this object is the whole authorization decision for these
// tests -- there is no canDeleteProject helper any more.
const mockSubject = {
  userId: 1,
  isAdmin: true,
  memberProjectIds: [] as number[],
  directorProjectIds: [] as number[],
};

jest.mock('../auth', () => ({
  authenticateRequest: (...a: unknown[]) => mockAuthenticateRequest(...a),
  resolveAuth: async (...a: unknown[]) => ({
    context: await mockAuthenticateRequest(...a),
    subject: mockSubject,
  }),
}));

const mockDeleteExecute = jest.fn();
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    deleteFrom: () => ({
      where: () => ({ execute: (...a: unknown[]) => mockDeleteExecute(...a) }),
    }),
  },
}));

import { handler } from '../handler';

function deleteEvent(id: string | number) {
  return {
    rawPath: `/${id}`,
    requestContext: { http: { method: 'DELETE' } },
    headers: { Authorization: 'Bearer fake-token' },
  } as any;
}

const adminContext = {
  isAuthenticated: true,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'admin@branch.org', isAdmin: true },
};

const staffContext = {
  isAuthenticated: true,
  user: { cognitoSub: 'staff-sub', userId: 5, email: 'staff@branch.org', isAdmin: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSubject.isAdmin = true;
  mockDeleteExecute.mockResolvedValue([{ numDeletedRows: 1n }]);
});

describe('DELETE /projects/{id}', () => {
  test('401 when unauthenticated, and nothing is deleted', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });

    const res = await handler(deleteEvent(4));

    expect(res.statusCode).toBe(401);
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  test('403 for an authenticated non-admin, and nothing is deleted', async () => {
    mockAuthenticateRequest.mockResolvedValue(staffContext);
    mockSubject.isAdmin = false;

    const res = await handler(deleteEvent(4));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  test('200 for an admin', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);

    const res = await handler(deleteEvent(4));

    expect(res.statusCode).toBe(200);
    expect(mockDeleteExecute).toHaveBeenCalled();
  });

  test('404 when an admin targets a project that does not exist', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);
    mockDeleteExecute.mockResolvedValue([{ numDeletedRows: 0n }]);

    const res = await handler(deleteEvent(999));

    expect(res.statusCode).toBe(404);
  });

  test('400 for a non-numeric id from an admin', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);

    const res = await handler(deleteEvent('abc'));

    expect(res.statusCode).toBe(400);
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  // Authorization now runs in dispatch, before the controller sees the id, so a
  // non-admin gets 403 rather than a 400 that would confirm the id is malformed
  // — and either way nothing is deleted.
  test('403, not 400, for a non-numeric id from a non-admin', async () => {
    mockAuthenticateRequest.mockResolvedValue(staffContext);
    mockSubject.isAdmin = false;

    const res = await handler(deleteEvent('abc'));

    expect(res.statusCode).toBe(403);
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });
});
