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
const mockCanDeleteProject = jest.fn();

jest.mock('../auth', () => ({
  authenticateRequest: (...a: unknown[]) => mockAuthenticateRequest(...a),
  canDeleteProject: (...a: unknown[]) => mockCanDeleteProject(...a),
  canAccessProject: jest.fn(),
  canCreateProject: jest.fn(),
  canEditProject: jest.fn(),
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
    mockCanDeleteProject.mockResolvedValue(false);

    const res = await handler(deleteEvent(4));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Admin access required');
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  test('200 for an admin', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);
    mockCanDeleteProject.mockResolvedValue(true);

    const res = await handler(deleteEvent(4));

    expect(res.statusCode).toBe(200);
    expect(mockCanDeleteProject).toHaveBeenCalledWith(1);
    expect(mockDeleteExecute).toHaveBeenCalled();
  });

  test('404 when an admin targets a project that does not exist', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);
    mockCanDeleteProject.mockResolvedValue(true);
    mockDeleteExecute.mockResolvedValue([{ numDeletedRows: 0n }]);

    const res = await handler(deleteEvent(999));

    expect(res.statusCode).toBe(404);
  });

  test('400 for a non-numeric id, checked before any authorization work', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminContext);

    const res = await handler(deleteEvent('abc'));

    expect(res.statusCode).toBe(400);
    expect(mockCanDeleteProject).not.toHaveBeenCalled();
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });
});
