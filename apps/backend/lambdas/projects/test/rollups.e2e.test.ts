/**
 * The rollups must be exact, not eventually correct. `auditRollups` re-derives
 * every rollup figure from the base tables; each test mutates in one shape and
 * audits, so a regression names the trigger path that broke.
 */
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

/**
 * Every rollup figure, re-derived from the base tables. category is COALESCE'd
 * into the join key because a FULL JOIN cannot use IS NOT DISTINCT FROM and
 * USING(category) would never match NULL to NULL.
 */
async function auditRollups(client: PoolClient): Promise<void> {
  const expenditures = await client.query(`
    SELECT er.project_id, er.month, er.cat_key, er.status,
           er.total_amount AS rollup_amount, live.total_amount AS live_amount,
           er.expenditure_count AS rollup_count, live.expenditure_count AS live_count
      FROM (
        SELECT project_id, month, COALESCE(category, '<null>') AS cat_key, status,
               total_amount, expenditure_count
          FROM branch.expenditure_rollup
         WHERE expenditure_count <> 0
      ) er
      FULL OUTER JOIN (
        SELECT project_id, date_trunc('month', spent_on)::date AS month,
               COALESCE(category, '<null>') AS cat_key, status,
               SUM(amount) AS total_amount, COUNT(*)::int AS expenditure_count
          FROM branch.expenditures
         GROUP BY 1, 2, 3, 4
      ) live USING (project_id, month, cat_key, status)
     WHERE er.total_amount      IS DISTINCT FROM live.total_amount
        OR er.expenditure_count IS DISTINCT FROM live.expenditure_count
  `);
  expect(expenditures.rows).toEqual([]);

  const projects = await client.query(`
    SELECT pr.project_id,
           pr.member_count, live.member_count AS live_member_count,
           pr.total_donated, live.total_donated AS live_total_donated,
           pr.donation_count, live.donation_count AS live_donation_count,
           pr.report_count, live.report_count AS live_report_count
      FROM branch.project_rollup pr
      FULL OUTER JOIN (
        SELECT p.project_id,
               (SELECT count(*) FROM branch.project_memberships m WHERE m.project_id = p.project_id) AS member_count,
               (SELECT COALESCE(SUM(amount), 0) FROM branch.project_donations d WHERE d.project_id = p.project_id) AS total_donated,
               (SELECT count(*) FROM branch.project_donations d WHERE d.project_id = p.project_id) AS donation_count,
               (SELECT count(*) FROM branch.reports r WHERE r.project_id = p.project_id) AS report_count
          FROM branch.projects p
      ) live USING (project_id)
     WHERE pr.member_count   IS DISTINCT FROM live.member_count
        OR pr.total_donated  IS DISTINCT FROM live.total_donated
        OR pr.donation_count IS DISTINCT FROM live.donation_count
        OR pr.report_count   IS DISTINCT FROM live.report_count
  `);
  expect(projects.rows).toEqual([]);
}

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
  await db.destroy();
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

/** Live buckets for one project. Emptied buckets stay at zero, so exclude them. */
async function bucketsFor(projectId: number): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM branch.expenditure_rollup
      WHERE project_id = $1 AND expenditure_count <> 0`,
    [projectId],
  );
  return rows[0].n;
}

describe('backfill and reset', () => {
  test('truncate + reseed rebuilds both rollups through the triggers', async () => {
    // resetData truncates the rollups too; the triggers put the figures back.
    await resetData(client);
    await auditRollups(client);
  });
});

describe('expenditure_rollup trigger', () => {
  test('INSERT lands in a bucket and reaches the dashboard', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await auditRollups(client);

    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(250);
  });

  test('unapproved rows are rolled up but stay out of every spend figure', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE),
             (1, 1, 900, 'Travel', 'pending',  CURRENT_DATE)
    `);
    await auditRollups(client);

    // Status is part of the grain, so both rows are stored — separately.
    expect(await bucketsFor(1)).toBe(2);
    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(250);
  });

  test('two NULL-category rows share one bucket', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 50, NULL, 'approved', DATE '2026-03-11'),
             (1, 1, 25, NULL, 'approved', DATE '2026-03-12')
    `);
    await auditRollups(client);

    const { rows } = await client.query(`
      SELECT total_amount, expenditure_count FROM branch.expenditure_rollup
       WHERE project_id = 1 AND category IS NULL AND month = DATE '2026-03-01'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].total_amount)).toBe(75);
    expect(rows[0].expenditure_count).toBe(2);
  });

  test('UPDATE of the amount alone stays in the same bucket', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`UPDATE branch.expenditures SET amount = 400 WHERE project_id = 1`);
    await auditRollups(client);

    expect(await bucketsFor(1)).toBe(1);
    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(400);
  });

  test.each([
    ['category', `SET category = 'Equipment'`],
    ['month', `SET spent_on = CURRENT_DATE - INTERVAL '2 months'`],
    ['status', `SET status = 'denied'`],
    ['project', `SET project_id = 2`],
  ])('UPDATE crossing %s decrements the old bucket and increments the new', async (_col, setClause) => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`UPDATE branch.expenditures ${setClause} WHERE project_id = 1`);
    await auditRollups(client);
  });

  test('a status change moves spend off the dashboard', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`UPDATE branch.expenditures SET status = 'denied' WHERE project_id = 1`);
    await auditRollups(client);

    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(0);
  });

  test('DELETE decrements the bucket', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE),
             (1, 1, 100, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`DELETE FROM branch.expenditures WHERE amount = 100`);
    await auditRollups(client);

    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(250);
  });

  test('one statement updating many rows moves every one of them', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 10, 'Travel',    'pending', CURRENT_DATE),
             (1, 1, 20, 'Equipment', 'pending', CURRENT_DATE),
             (2, 1, 30, 'Travel',    'pending', CURRENT_DATE)
    `);
    await auditRollups(client);

    await client.query(`UPDATE branch.expenditures SET status = 'approved'`);
    await auditRollups(client);

    expect((await get('/dashboard')).summary.totalSpent).toBe(60);
  });

  test('TRUNCATE clears the rollup even though it fires no row triggers', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query('TRUNCATE branch.expenditures');
    await auditRollups(client);

    expect(await bucketsFor(1)).toBe(0);
    expect((await get('/dashboard')).summary.totalSpent).toBe(0);
  });

  test('deleting a project cascades without orphaning or resurrecting a bucket', async () => {
    // Cascade order is undefined, so the decrement must tolerate a bucket
    // that is already gone rather than re-inserting it.
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (4, 1, 250, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`
      INSERT INTO branch.reports (project_id, title, object_url, report_type)
      VALUES (4, 'r', 's3://r', 'technical')
    `);
    await client.query(`DELETE FROM branch.projects WHERE project_id = 4`);
    await auditRollups(client);

    const orphans = await client.query(`
      SELECT (SELECT count(*)::int FROM branch.expenditure_rollup er
                LEFT JOIN branch.projects p USING (project_id) WHERE p.project_id IS NULL) AS exp_orphans,
             (SELECT count(*)::int FROM branch.project_rollup pr
                LEFT JOIN branch.projects p USING (project_id) WHERE p.project_id IS NULL) AS proj_orphans
    `);
    expect(orphans.rows[0]).toEqual({ exp_orphans: 0, proj_orphans: 0 });
  });
});

describe('project_rollup trigger', () => {
  test('a new project gets a zeroed rollup row', async () => {
    const { rows } = await client.query(`
      INSERT INTO branch.projects (name, description, total_budget, start_date, currency)
      VALUES ('fresh', 'x', 500, CURRENT_DATE, 'USD') RETURNING project_id
    `);
    await auditRollups(client);

    const rollup = await client.query(
      'SELECT * FROM branch.project_rollup WHERE project_id = $1',
      [rows[0].project_id],
    );
    expect(rollup.rows).toHaveLength(1);
    expect(rollup.rows[0].member_count).toBe(0);
    expect(Number(rollup.rows[0].total_donated)).toBe(0);
  });

  test('donations move totalDonated on the project overview', async () => {
    await client.query(`
      INSERT INTO branch.project_donations (donor_id, project_id, amount) VALUES (1, 1, 500)
    `);
    await auditRollups(client);
    expect((await get('/1/overview')).stats.totalDonated).toBe(500);

    await client.query(`UPDATE branch.project_donations SET amount = 650 WHERE project_id = 1`);
    await auditRollups(client);
    expect((await get('/1/overview')).stats.totalDonated).toBe(650);

    await client.query(`DELETE FROM branch.project_donations WHERE project_id = 1`);
    await auditRollups(client);
    expect((await get('/1/overview')).stats.totalDonated).toBe(0);
  });

  test('membership churn keeps member_count exact through delete-then-insert', async () => {
    // syncMemberships deletes then re-inserts, so the counter drops and climbs.
    await client.query(`DELETE FROM branch.project_memberships WHERE project_id = 1`);
    await auditRollups(client);
    await client.query(`
      INSERT INTO branch.project_memberships (project_id, user_id, role)
      VALUES (1, 1, 'Student'), (1, 2, 'Student')
    `);
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT member_count FROM branch.project_rollup WHERE project_id = 1',
    );
    expect(rows[0].member_count).toBe(2);
  });

  test('moving a donation between projects debits one and credits the other', async () => {
    await client.query(`
      INSERT INTO branch.project_donations (donor_id, project_id, amount) VALUES (1, 1, 500)
    `);
    await client.query(`UPDATE branch.project_donations SET project_id = 2 WHERE project_id = 1`);
    await auditRollups(client);

    expect((await get('/1/overview')).stats.totalDonated).toBe(0);
    expect((await get('/2/overview')).stats.totalDonated).toBe(500);
  });

  test('moving a membership between projects debits one and credits the other', async () => {
    await client.query(`DELETE FROM branch.project_memberships`);
    await client.query(`
      INSERT INTO branch.project_memberships (project_id, user_id, role) VALUES (1, 1, 'Student')
    `);
    await client.query(`
      UPDATE branch.project_memberships SET project_id = 2 WHERE project_id = 1 AND user_id = 1
    `);
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT project_id, member_count FROM branch.project_rollup WHERE project_id IN (1, 2)',
    );
    const byProject = new Map(rows.map((r: any) => [r.project_id, r.member_count]));
    expect(byProject.get(1)).toBe(0);
    expect(byProject.get(2)).toBe(1);
  });

  test('TRUNCATE of donations, memberships and reports zeroes their counters', async () => {
    await client.query(`
      INSERT INTO branch.project_donations (donor_id, project_id, amount) VALUES (1, 1, 500)
    `);
    await client.query(`
      INSERT INTO branch.reports (project_id, title, object_url, report_type)
      VALUES (1, 'a', 's3://a', 'technical')
    `);
    await client.query('TRUNCATE branch.project_donations, branch.project_memberships, branch.reports');
    await auditRollups(client);

    const { rows } = await client.query('SELECT * FROM branch.project_rollup WHERE project_id = 1');
    expect(rows[0].member_count).toBe(0);
    expect(rows[0].donation_count).toBe(0);
    expect(rows[0].report_count).toBe(0);
    expect(Number(rows[0].total_donated)).toBe(0);
  });

  test('reports move report_count', async () => {
    await client.query(`
      INSERT INTO branch.reports (project_id, title, object_url, report_type)
      VALUES (1, 'a', 's3://a', 'technical'), (1, 'b', 's3://b', 'narrative')
    `);
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT report_count FROM branch.project_rollup WHERE project_id = 1',
    );
    expect(rows[0].report_count).toBe(2);

    await client.query(`DELETE FROM branch.reports WHERE project_id = 1 AND title = 'a'`);
    await auditRollups(client);
  });
});

describe('rollup-backed read paths agree with the base tables', () => {
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
       WHERE status = 'approved'
         AND spent_on >= date_trunc('year', CURRENT_DATE)
         AND spent_on <  date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'
    `);
    const body = await get('/dashboard');
    expect(body.summary.totalSpent).toBe(Number(rows[0].total));
  });

  test('dashboard per-project spend equals the approved sum per project', async () => {
    const { rows } = await client.query(`
      SELECT project_id, SUM(amount) AS total FROM branch.expenditures
       WHERE status = 'approved' GROUP BY project_id
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
       WHERE status = 'approved' AND category IS NOT NULL
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
