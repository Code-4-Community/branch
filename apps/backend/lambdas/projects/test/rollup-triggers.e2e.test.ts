/**
 * The rollup triggers, tested against the database alone — no handler, no auth.
 * `auditRollups` re-derives every rollup figure from the base tables; each test
 * mutates in one shape and audits, so a regression names the path that broke.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

/**
 * category is COALESCE'd into the join key because a FULL JOIN cannot use
 * IS NOT DISTINCT FROM and USING(category) would never match NULL to NULL.
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
  client = await pool.connect();
  await resetData(client);
  await client.query('DELETE FROM branch.expenditures');
  await client.query('DELETE FROM branch.project_donations');
  await client.query('DELETE FROM branch.reports');
});

afterEach(() => {
  client.release();
});

afterAll(async () => {
  await pool.end();
});

/** Live buckets for one project. Emptied buckets stay at zero, so exclude them. */
async function bucketsFor(projectId: number): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM branch.expenditure_rollup
      WHERE project_id = $1 AND expenditure_count <> 0`,
    [projectId],
  );
  return rows[0].n;
}

async function approvedTotal(): Promise<number> {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS t FROM branch.expenditure_rollup
      WHERE status = 'approved'`,
  );
  return Number(rows[0].t);
}

const oneExpenditure = `
  INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
  VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE)
`;

describe('backfill', () => {
  test('truncate + reseed rebuilds both rollups through the triggers', async () => {
    await resetData(client);
    await auditRollups(client);
  });
});

describe('expenditure_rollup', () => {
  test('INSERT lands in a bucket', async () => {
    await client.query(oneExpenditure);
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(1);
    expect(await approvedTotal()).toBe(250);
  });

  test('status is part of the grain, so an unapproved row is stored separately', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE),
             (1, 1, 900, 'Travel', 'pending',  CURRENT_DATE)
    `);
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(2);
    expect(await approvedTotal()).toBe(250);
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

  test("a category of '' does not share NULL's bucket", async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 50, NULL, 'approved', DATE '2026-03-11'),
             (1, 1, 25, '',   'approved', DATE '2026-03-12')
    `);
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(2);
  });

  test('UPDATE of the amount alone stays in the same bucket', async () => {
    await client.query(oneExpenditure);
    await client.query(`UPDATE branch.expenditures SET amount = 400 WHERE project_id = 1`);
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(1);
    expect(await approvedTotal()).toBe(400);
  });

  test.each([
    ['category', `SET category = 'Equipment'`],
    ['month', `SET spent_on = CURRENT_DATE - INTERVAL '2 months'`],
    ['status', `SET status = 'denied'`],
    ['project', `SET project_id = 2`],
    ['category to NULL', `SET category = NULL`],
  ])('UPDATE crossing %s debits the old bucket and credits the new', async (_col, setClause) => {
    await client.query(oneExpenditure);
    await client.query(`UPDATE branch.expenditures ${setClause} WHERE project_id = 1`);
    await auditRollups(client);
  });

  test('a status change takes the row out of approved spend', async () => {
    await client.query(oneExpenditure);
    await client.query(`UPDATE branch.expenditures SET status = 'denied' WHERE project_id = 1`);
    await auditRollups(client);
    expect(await approvedTotal()).toBe(0);
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
    expect(await approvedTotal()).toBe(60);
  });

  test('DELETE decrements the bucket', async () => {
    await client.query(`
      INSERT INTO branch.expenditures (project_id, entered_by, amount, category, status, spent_on)
      VALUES (1, 1, 250, 'Travel', 'approved', CURRENT_DATE),
             (1, 1, 100, 'Travel', 'approved', CURRENT_DATE)
    `);
    await client.query(`DELETE FROM branch.expenditures WHERE amount = 100`);
    await auditRollups(client);
    expect(await approvedTotal()).toBe(250);
  });

  test('TRUNCATE clears the rollup even though it fires no row triggers', async () => {
    await client.query(oneExpenditure);
    await client.query('TRUNCATE branch.expenditures');
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(0);
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

describe('project_rollup', () => {
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

  test('donations add, update and remove', async () => {
    await client.query(`
      INSERT INTO branch.project_donations (donor_id, project_id, amount) VALUES (1, 1, 500)
    `);
    await auditRollups(client);
    await client.query(`UPDATE branch.project_donations SET amount = 650 WHERE project_id = 1`);
    await auditRollups(client);
    await client.query(`DELETE FROM branch.project_donations WHERE project_id = 1`);
    await auditRollups(client);
  });

  test('moving a donation between projects debits one and credits the other', async () => {
    await client.query(`
      INSERT INTO branch.project_donations (donor_id, project_id, amount) VALUES (1, 1, 500)
    `);
    await client.query(`UPDATE branch.project_donations SET project_id = 2 WHERE project_id = 1`);
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT project_id, total_donated FROM branch.project_rollup WHERE project_id IN (1, 2) ORDER BY project_id',
    );
    expect(Number(rows[0].total_donated)).toBe(0);
    expect(Number(rows[1].total_donated)).toBe(500);
  });

  test('membership churn survives delete-then-insert', async () => {
    // syncMemberships deletes then re-inserts, so the counter drops and climbs.
    await client.query(`DELETE FROM branch.project_memberships WHERE project_id = 1`);
    await auditRollups(client);
    await client.query(`
      INSERT INTO branch.project_memberships (project_id, user_id, role)
      VALUES (1, 1, 'Student'), (1, 2, 'Student')
    `);
    await auditRollups(client);
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
  });

  test('reports add and remove', async () => {
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
});
