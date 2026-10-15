/**
 * DELETE /projects/{id} keeps the project's files: the delete is soft, so a
 * restore must find its receipts and reports still in the bucket.
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
jest.mock('@branch/store', () => ({
  __esModule: true,
  db: {},
  removeProject: (...a: unknown[]) => mockDeleteExecute(...a),
}));

const mockS3Send = jest.fn<(command: any) => Promise<any>>();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  ListObjectsV2Command: jest.fn(),
  DeleteObjectsCommand: jest.fn(),
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

describe('DELETE /projects/{id} keeps files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REPORTS_BUCKET_NAME = 'bucket';
    mockSubject.isAdmin = true;
    mockAuthenticateRequest.mockResolvedValue(adminContext as never);
    mockDeleteExecute.mockResolvedValue(1n as never);
  });

  test('deletes the project without touching S3', async () => {
    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      route: 'DELETE /projects/{projectId}',
      pathParams: { id: '7' },
    });
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test('404s when the row was already gone', async () => {
    mockDeleteExecute.mockResolvedValue(0n as never);

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(404);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test('does not run for a caller who may not delete', async () => {
    mockSubject.isAdmin = false;

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(403);
    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });
});
