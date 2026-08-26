/**
 * DELETE /projects/{id} clears the project's files out of the bucket.
 *
 * The expenditure and report rows go with the project via ON DELETE CASCADE, so
 * by the time the handler could look, nothing names the files any more. Both
 * services key their objects by project id, so the prefixes are the only record
 * left — which makes a project delete the single largest source of orphans if
 * this does not run.
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

const mockS3Send = jest.fn<(command: any) => Promise<any>>();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  ListObjectsV2Command: jest
    .fn()
    .mockImplementation((p: unknown) => ({ __type: 'List', ...(p as object) })),
  DeleteObjectsCommand: jest
    .fn()
    .mockImplementation((p: unknown) => ({ __type: 'DeleteObjects', ...(p as object) })),
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

/** Answers a List for `prefix` with `keys`, and every other List as empty. */
function listReturns(map: Record<string, string[]>) {
  mockS3Send.mockImplementation(async (command: any) => {
    if (command.__type === 'List') {
      const keys = map[command.Prefix] ?? [];
      return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
    }
    return {};
  });
}

describe('DELETE /projects/{id} object cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REPORTS_BUCKET_NAME = 'bucket';
    mockSubject.isAdmin = true;
  mockAuthenticateRequest.mockResolvedValue(adminContext as never);
    mockDeleteExecute.mockResolvedValue([{ numDeletedRows: 1n }] as never);
  });

  test('clears both the receipts and reports prefixes for that project', async () => {
    listReturns({
      'receipts/7/': ['receipts/7/a.pdf', 'receipts/7/b.pdf'],
      'reports/7/': ['reports/7/q1.docx'],
    });

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).filesDeleted).toBe(3);

    const deleted = mockS3Send.mock.calls
      .map(([c]) => c)
      .filter((c: any) => c.__type === 'DeleteObjects')
      .flatMap((c: any) => c.Delete.Objects.map((o: any) => o.Key));

    expect(deleted.sort()).toEqual([
      'receipts/7/a.pdf',
      'receipts/7/b.pdf',
      'reports/7/q1.docx',
    ]);
  });

  test('scopes the listing to that project, not the whole bucket', async () => {
    listReturns({});

    await handler(deleteEvent(7));

    const prefixes = mockS3Send.mock.calls
      .map(([c]) => c)
      .filter((c: any) => c.__type === 'List')
      .map((c: any) => c.Prefix);

    expect(prefixes.sort()).toEqual(['receipts/7/', 'reports/7/']);
  });

  test('issues no delete when the project owns no files', async () => {
    listReturns({});

    const res = await handler(deleteEvent(7));

    expect(JSON.parse(res.body).filesDeleted).toBe(0);
    expect(
      mockS3Send.mock.calls.map(([c]) => c).some((c: any) => c.__type === 'DeleteObjects'),
    ).toBe(false);
  });

  test('follows pagination past the 1000-key page limit', async () => {
    let call = 0;
    mockS3Send.mockImplementation(async (command: any) => {
      if (command.__type !== 'List') return {};
      if (command.Prefix !== 'receipts/7/') return { Contents: [], IsTruncated: false };
      call += 1;
      // First page is truncated, so the loop must come back with the cursor.
      return call === 1
        ? { Contents: [{ Key: 'receipts/7/1.pdf' }], IsTruncated: true, NextContinuationToken: 'tok' }
        : { Contents: [{ Key: 'receipts/7/2.pdf' }], IsTruncated: false };
    });

    const res = await handler(deleteEvent(7));

    expect(JSON.parse(res.body).filesDeleted).toBe(2);
    const second = mockS3Send.mock.calls
      .map(([c]) => c)
      .find((c: any) => c.__type === 'List' && c.ContinuationToken === 'tok');
    expect(second).toBeDefined();
  });

  test('a failing S3 cleanup still deletes the project', async () => {
    // Leftover objects are recoverable; a project that cannot be deleted is not.
    mockS3Send.mockRejectedValue(new Error('AccessDenied') as never);

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).filesDeleted).toBeNull();
  });

  test('touches nothing when the row was already gone', async () => {
    mockDeleteExecute.mockResolvedValue([{ numDeletedRows: 0n }] as never);
    listReturns({ 'receipts/7/': ['receipts/7/a.pdf'] });

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(404);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test('does not run for a caller who may not delete', async () => {
    mockSubject.isAdmin = false;

    const res = await handler(deleteEvent(7));

    expect(res.statusCode).toBe(403);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
