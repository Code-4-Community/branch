import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

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
  createProject,
  editExpenditure,
  recordDonation,
  recordExpenditure,
  removeDonation,
  removeDonor,
  removeExpenditure,
  removeProject,
  updateProject,
} from '@branch/store';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const pool = new Pool({
  host: 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

let client: PoolClient;

beforeAll(async () => {
  const setup = await pool.connect();
  try {
    await ensureSchema(setup);
  } finally {
    setup.release();
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

  client = await pool.connect();
  await resetData(client);
  // Seed projects 1-4 stay active so the dashboard's active-project count and
  // its average are stable regardless of when the suite runs.
  await client.query(`UPDATE branch.projects SET end_date = '2099-12-31' WHERE end_date IS NOT NULL`);
  // Cleared so figures are exact, not "seed plus what I added". Seeded
  // memberships stay as extra coverage.
  await client.query('DELETE FROM branch.expenditures');
  await client.query('DELETE FROM branch.project_donations');
  await client.query('DELETE FROM branch.reports');
});

afterEach(() => {
  client.release();
});

afterAll(async () => {
  await pool.end();
  await closeConnection();
});

async function get(rawPath: string) {
  const res = await handler({
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: {},
  } as any);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

const today = new Date().toISOString().slice(0, 10);

const travel = {
  project_id: 1,
  entered_by: 1,
  amount: 250,
  category: 'Travel',
  status: 'approved',
  spent_on: today,
};

describe('expenditure spend reaches the dashboard', () => {
  test('a recorded expenditure counts', async () => {
    await recordExpenditure(travel);
    expect((await get('/dashboard')).summary.totalSpent).toBe(250);
  });

  test('unapproved rows stay out of every spend figure', async () => {
    await recordExpenditure(travel);
    await recordExpenditure({ ...travel, amount: 900, status: 'pending' });
    expect((await get('/dashboard')).summary.totalSpent).toBe(250);
  });

  test('an edited amount replaces the old one', async () => {
    const row = await recordExpenditure(travel);
    await editExpenditure(row.expenditure_id, { amount: 400 });
    expect((await get('/dashboard')).summary.totalSpent).toBe(400);
  });

  test('a status change moves spend off the dashboard', async () => {
    const row = await recordExpenditure(travel);
    await editExpenditure(row.expenditure_id, { status: 'denied' });
    expect((await get('/dashboard')).summary.totalSpent).toBe(0);
  });

  test('a removed expenditure stops counting', async () => {
    await recordExpenditure(travel);
    const second = await recordExpenditure({ ...travel, amount: 100 });
    await removeExpenditure(second.expenditure_id);
    expect((await get('/dashboard')).summary.totalSpent).toBe(250);
  });

  test("a deleted project's spend leaves the dashboard", async () => {
    await recordExpenditure({ ...travel, project_id: 4 });
    await removeProject(4);

    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(0);
    expect(body.projects.some((p: any) => p.project_id === 4)).toBe(false);
  });
});

describe('project overview figures', () => {
  test('a new project reads zero everywhere', async () => {
    const created = await createProject(
      { name: 'fresh', description: 'x', total_budget: 500, currency: 'USD' },
      [],
      'Student',
    );
    const body = await get(`/${created.project_id}/overview`);
    expect(body.stats.totalDonated).toBe(0);
    expect(body.stats.totalSpent).toBe(0);
  });

  test('donations move totalDonated on the project overview', async () => {
    const donation = await recordDonation({ donor_id: 1, project_id: 1, amount: 500 });
    expect((await get('/1/overview')).stats.totalDonated).toBe(500);

    await removeDonation(donation.donation_id);
    expect((await get('/1/overview')).stats.totalDonated).toBe(0);
  });

  test('deleting a donor takes its donations off the overview', async () => {
    await recordDonation({ donor_id: 1, project_id: 1, amount: 500 });
    await removeDonor(1);
    expect((await get('/1/overview')).stats.totalDonated).toBe(0);
  });

  test('adding a non-admin member raises dashboard staff_count by one', async () => {
    const staffCount = async () =>
      (await get('/dashboard')).projects.find((p: any) => p.project_id === 1).staff_count;
    const before = await staffCount();

    const { rows: added } = await client.query(
      `INSERT INTO branch.users (email, name, is_admin) VALUES ('newmember@branch.org', 'New Member', false)
       RETURNING user_id`,
    );
    const { rows: current } = await client.query(
      'SELECT user_id FROM branch.project_memberships WHERE project_id = 1',
    );
    await updateProject(
      1,
      {},
      [...current.map((r) => ({ user_id: r.user_id })), { user_id: added[0].user_id }],
      'Student',
    );

    expect(await staffCount()).toBe(before + 1);
  });
});

describe('read paths agree with the base tables', () => {
  beforeEach(async () => {
    // Spread across months, categories, statuses and projects.
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 100, 'Travel',    'approved', date_trunc('year', CURRENT_DATE)),
             (1, 1, 200, 'Travel',    'approved', date_trunc('year', CURRENT_DATE) + INTERVAL '1 month'),
             (1, 1, 300, 'Equipment', 'approved', date_trunc('year', CURRENT_DATE) + INTERVAL '1 month'),
             (1, 1, 400, 'Equipment', 'pending',  date_trunc('year', CURRENT_DATE)),
             (2, 1, 500, 'Travel',    'approved', date_trunc('year', CURRENT_DATE)),
             (2, 1,  50, NULL,        'approved', date_trunc('year', CURRENT_DATE))
    `);
  });

  test('dashboard totalSpent equals the approved sum for the year', async () => {
    const { rows } = await client.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM branch.expenditures
       WHERE status = 'approved' AND deleted_at IS NULL
         AND spent_on >= date_trunc('year', CURRENT_DATE)
         AND spent_on <  date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'
    `);
    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(Number(rows[0].total));
  });

  test('dashboard per-project spend equals the approved sum per project', async () => {
    const { rows } = await client.query(`
      SELECT project_id, SUM(amount) AS total FROM branch.expenditures
       WHERE status = 'approved' AND deleted_at IS NULL GROUP BY project_id
    `);
    const expected = new Map(rows.map((r) => [r.project_id, Number(r.total)]));

    const body = await get('/dashboard');
    for (const p of body.projects) {
      expect(p.spent).toBe(expected.get(p.project_id) ?? 0);
    }
  });

  test('the bar chart series matches month x category over approved rows', async () => {
    const { rows } = await client.query(`
      SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS month, category,
             SUM(amount) AS total
        FROM branch.expenditures
       WHERE status = 'approved' AND category IS NOT NULL AND deleted_at IS NULL
         AND spent_on >= date_trunc('year', CURRENT_DATE)
         AND spent_on <  date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'
       GROUP BY 1, 2 ORDER BY 1, 2
    `);
    const expected = rows.map((r) => ({
      month: r.month,
      category: r.category,
      amount: Number(r.total),
    }));

    const body = await get('/dashboard');
    expect(body.expensesByMonth).toEqual(expected);
  });

  test('the uncategorised bucket is excluded from the chart but not from totalSpent', async () => {
    const body = await get('/dashboard');
    // Approved rows are 100 + 200 + 300 + 500 + 50; the 400 is pending.
    expect(body.summary.totalSpent).toBe(1150);
    // The chart plots named categories only, so the 50 is the difference.
    expect(body.expensesByMonth.some((r: any) => r.category === null)).toBe(false);
    const charted = body.expensesByMonth.reduce((s: number, r: any) => s + r.amount, 0);
    expect(charted).toBe(1100);
  });

  test('project list total_spent equals the approved sum per project', async () => {
    const projects = await get('/');
    expect(projects.find((p: any) => p.project_id === 1).total_spent).toBe(600);
    expect(projects.find((p: any) => p.project_id === 2).total_spent).toBe(550);
    expect(projects.find((p: any) => p.project_id === 3).total_spent).toBe(0);
  });

  test('overview stats still come from the row list, so table and total agree', async () => {
    const body = await get('/1/overview');
    const listed = body.expenditures
      .filter((e: any) => e.status === 'approved')
      .reduce((s: number, e: any) => s + Number(e.amount), 0);
    expect(body.stats.totalSpent).toBe(listed);
    expect(body.stats.expenditureCount).toBe(3);
  });
});
