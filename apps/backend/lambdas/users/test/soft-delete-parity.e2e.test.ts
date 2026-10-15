/**
 * A soft-deleted row must read exactly like a hard-deleted one. Delete one of each
 * kind through the store, snapshot every GET, purge the soft-deleted rows, and
 * snapshot again: the two must be identical.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData, purgeSoftDeleted, PARITY_DELETES } from '../../../db/testkit';

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      User: { Attributes: [{ Name: 'sub', Value: 'test-cognito-sub-123' }] },
    } as never),
  })),
  AdminCreateUserCommand: jest.fn().mockImplementation((args) => args),
  AdminDeleteUserCommand: jest.fn().mockImplementation((args) => args),
}));

jest.mock('../auth', () => {
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { loadRbacSubject } = jest.requireActual<typeof import('@branch/lambda-auth')>(
    '@branch/lambda-auth',
  );
  const db = jest.requireActual<typeof import('@branch/store')>('@branch/store').db;
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(
      authenticateRequest as never,
      (context) => loadRbacSubject(db as never, context),
    ),
  };
});

import { handler } from '../handler';
import {
  closeConnection,
  removeDonation,
  removeDonor,
  removeExpenditure,
  removeProject,
  removeReport,
  removeUser,
} from '@branch/store';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const REQUESTS: [string, Record<string, string> | null][] = [
  ['/users', null],
  ['/users', { page: '1', limit: '3' }],
  ['/users', { page: '2', limit: '3' }],
  ['/users', { page: '1', limit: '100' }],
  ...[1, 2, 3, 4, 5, 6].map((id): [string, null] => [`/users/${id}`, null]),
];

async function snapshot(): Promise<Record<string, { status: number; body: string }>> {
  const out: Record<string, { status: number; body: string }> = {};
  for (const [rawPath, queryStringParameters] of REQUESTS) {
    const res = await handler({
      rawPath,
      path: rawPath,
      requestContext: { http: { method: 'GET' } },
      httpMethod: 'GET',
      body: null,
      queryStringParameters,
      headers: {},
    } as any);
    out[`${rawPath}?${new URLSearchParams(queryStringParameters ?? {})}`] = {
      status: res.statusCode,
      body: res.body,
    };
  }
  return out;
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    await resetData(client);
  } finally {
    client.release();
  }
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true as const,
    user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
  });
});

afterAll(async () => {
  await pool.end();
  await closeConnection();
});

describe('soft-delete read parity', () => {
  test('every users GET reads the same as if the rows were hard-deleted', async () => {
    await removeExpenditure(PARITY_DELETES.expenditure);
    await removeDonation(PARITY_DELETES.donation);
    await removeDonor(PARITY_DELETES.donor);
    await removeReport(PARITY_DELETES.report);
    await removeProject(PARITY_DELETES.project);
    await removeUser(PARITY_DELETES.user);

    const soft = await snapshot();
    expect(soft[`/users/${PARITY_DELETES.user}?`].status).toBe(404);
    expect(Object.values(soft).some(({ body }) => body.includes('deleted_at'))).toBe(false);

    await purgeSoftDeleted(pool);
    expect(await snapshot()).toEqual(soft);
  });
});
