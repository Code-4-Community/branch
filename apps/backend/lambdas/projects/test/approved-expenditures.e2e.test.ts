/**
 * Every figure the app reports as money spent must count approved
 * expenditures only. A pending or denied row is a request, not a spend, so
 * letting it into a total overstates the budget burn and can show a project
 * as over budget on the strength of expenditures nobody signed off on.
 *
 * The raw lists (the project expense table, the admin review queue) stay
 * unfiltered — they exist to show what is awaiting review.
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. Only the authenticate half
  // is faked: the subject is still loaded from the seeded memberships, which is
  // what makes "director" and "member of this project" mean anything here.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { loadRbacSubject } = jest.requireActual<typeof import('@branch/lambda-auth')>(
    '@branch/lambda-auth',
  );
  const db = jest.requireActual<typeof import('../db')>('../db').default;
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
import db from '../db';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});

// One project, one budget, one of each status. Every assertion below reduces
// to "did the 1000 survive and the other 3000 stay out".
beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

  const client = await pool.connect();
  try {
    await resetData(client);
    await client.query('DELETE FROM branch.expenditures');
    await client.query(`
      INSERT INTO branch.expenditures
        (project_id, entered_by, amount, category, description, status, spent_on)
      VALUES
        (1, 1, 1000, 'Travel', 'approved', 'approved', CURRENT_DATE),
        (1, 1, 1000, 'Travel', 'pending', 'pending', CURRENT_DATE),
        (1, 1, 1000, 'Travel', 'denied', 'denied', CURRENT_DATE),
        (1, 1, 1000, 'Travel', 'needs info', 'needs_more_info', CURRENT_DATE)
    `);
    await client.query(`UPDATE branch.projects SET end_date = '2099-12-31' WHERE end_date IS NOT NULL`);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
  await db.destroy();
});

function getEvent(rawPath: string) {
  return {
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: {},
  } as any;
}

async function get(rawPath: string) {
  const res = await handler(getEvent(rawPath));
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

describe('GET /dashboard counts approved expenditures only', () => {
  test('totalSpent leaves out pending, denied and needs_more_info', async () => {
    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(1000);
  });

  test('topExpenseCategory sums approved rows only', async () => {
    const body = await get('/dashboard');
    expect(body.summary.topExpenseCategory).toEqual({
      category: 'Travel',
      amount: 1000,
      percentage: 100,
    });
  });

  test('averageSpendPerProject divides approved spend across active projects', async () => {
    const body = await get('/dashboard');
    // 1000 approved over the 4 active seed projects.
    expect(body.summary.averageSpendPerProject).toBe(250);
  });

  test('per-project spend on the dashboard cards is approved-only', async () => {
    const body = await get('/dashboard');
    const p1 = body.projects.find((p: any) => p.project_id === 1);
    expect(p1.spent).toBe(1000);
  });

  test('the expenses bar chart series is approved-only', async () => {
    const body = await get('/dashboard');
    const total = body.expensesByMonth.reduce((sum: number, r: any) => sum + r.amount, 0);
    expect(total).toBe(1000);
  });
});

describe('GET /projects counts approved expenditures only', () => {
  test('total_spent on the list cards leaves out unapproved rows', async () => {
    const projects = await get('/');
    const p1 = projects.find((p: any) => p.project_id === 1);
    expect(Number(p1.total_spent)).toBe(1000);
  });
});

describe('GET /projects/{id}/overview counts approved expenditures only', () => {
  test('stats are computed from approved rows', async () => {
    const body = await get('/1/overview');
    expect(body.stats.totalSpent).toBe(1000);
    expect(body.stats.totalRemaining).toBe(body.stats.totalBudget - 1000);
    expect(body.stats.expenditureCount).toBe(1);
  });

  test('the expenditures table still lists every row so reviewers can see them', async () => {
    const body = await get('/1/overview');
    expect(body.expenditures).toHaveLength(4);
    expect(body.expenditures.map((e: any) => e.status).sort()).toEqual([
      'approved',
      'denied',
      'needs_more_info',
      'pending',
    ]);
  });
});
