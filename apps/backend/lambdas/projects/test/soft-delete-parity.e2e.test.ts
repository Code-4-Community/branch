import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData, purgeSoftDeleted, PARITY_DELETES } from '../../../db/testkit';

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

const PATHS = [
  '/projects',
  '/projects/dashboard',
  '/projects/assignable-staff',
  ...[1, 2, 3, 4].flatMap((id) => [
    `/projects/${id}`,
    `/projects/${id}/members`,
    `/projects/${id}/overview`,
    `/projects/${id}/donors`,
    `/projects/${id}/expenditures`,
  ]),
];

async function snapshot(): Promise<Record<string, { status: number; body: string }>> {
  const out: Record<string, { status: number; body: string }> = {};
  for (const rawPath of PATHS) {
    const res = await handler({
      rawPath,
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: {},
    } as any);
    out[rawPath] = { status: res.statusCode, body: res.body };
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
  test('every projects GET reads the same as if the rows were hard-deleted', async () => {
    await removeExpenditure(PARITY_DELETES.expenditure);
    await removeDonation(PARITY_DELETES.donation);
    await removeDonor(PARITY_DELETES.donor);
    await removeReport(PARITY_DELETES.report);
    await removeProject(PARITY_DELETES.project);
    await removeUser(PARITY_DELETES.user);

    const soft = await snapshot();
    expect(soft[`/projects/${PARITY_DELETES.project}`].status).toBe(404);
    expect(Object.values(soft).some(({ body }) => body.includes('deleted_at'))).toBe(false);

    await purgeSoftDeleted(pool);
    expect(await snapshot()).toEqual(soft);
  });
});
