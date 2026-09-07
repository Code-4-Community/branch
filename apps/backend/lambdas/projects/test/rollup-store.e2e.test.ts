/**
 * @branch/store's rollup maintenance, tested against the database alone -- no
 * handler, no auth. `auditRollups` re-derives every rollup figure from the base
 * tables; each test mutates in one shape and audits, so a regression names the
 * operation that broke.
 *
 * Replaces rollup-triggers.e2e.test.ts. That file drove the row triggers with
 * raw SQL, including shapes no route can produce -- a bulk UPDATE with no WHERE,
 * TRUNCATE, moving an expenditure between projects by column. Those tested
 * trigger generality; what matters now is that every operation the store
 * exposes keeps the rollups exact.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { ensureSchema, resetData, reconcileRollups } from '../../../db/testkit';
import {
  closeConnection,
  createProject,
  editExpenditure,
  recordDonation,
  recordExpenditure,
  recordReport,
  removeDonation,
  removeDonor,
  removeExpenditure,
  removeProject,
  removeReport,
  removeUser,
  updateProject,
} from '@branch/store';

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
  // Fixture setup, not the behaviour under test: clear the seeded child rows
  // with raw SQL, then put the rollups back in step by hand.
  await client.query('DELETE FROM branch.expenditures');
  await client.query('DELETE FROM branch.project_donations');
  await client.query('DELETE FROM branch.reports');
  await reconcileRollups(client);
  await auditRollups(client);
});

afterEach(() => {
  client.release();
});

afterAll(async () => {
  await pool.end();
  await closeConnection();
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

const travel = {
  project_id: 1,
  entered_by: 1,
  amount: 250,
  category: 'Travel',
  status: 'approved',
  spent_on: '2026-03-11',
};

describe('reconcile', () => {
  test('resetData leaves both rollups in step with the base tables', async () => {
    await resetData(client);
    await auditRollups(client);
  });
});

describe('expenditure_rollup', () => {
  test('recordExpenditure lands in a bucket', async () => {
    await recordExpenditure(travel);
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(1);
    expect(await approvedTotal()).toBe(250);
  });

  test('status is part of the grain, so an unapproved row is stored separately', async () => {
    await recordExpenditure(travel);
    await recordExpenditure({ ...travel, amount: 900, status: 'pending' });
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(2);
    expect(await approvedTotal()).toBe(250);
  });

  test('two NULL-category rows share one bucket', async () => {
    await recordExpenditure({ ...travel, amount: 50, category: null });
    await recordExpenditure({ ...travel, amount: 25, category: null, spent_on: '2026-03-12' });
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
    await recordExpenditure({ ...travel, amount: 50, category: null });
    await recordExpenditure({ ...travel, amount: 25, category: '' });
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(2);
  });

  test('editing the amount alone stays in the same bucket', async () => {
    const row = await recordExpenditure(travel);
    await editExpenditure(row.expenditure_id, { amount: 400 });
    await auditRollups(client);
    expect(await bucketsFor(1)).toBe(1);
    expect(await approvedTotal()).toBe(400);
  });

  test.each([
    ['category', { category: 'Equipment' }],
    ['month', { spent_on: '2026-01-11' }],
    ['status', { status: 'denied' }],
    ['category to NULL', { category: null }],
  ])('an edit crossing %s debits the old bucket and credits the new', async (_label, patch) => {
    const row = await recordExpenditure(travel);
    await editExpenditure(row.expenditure_id, patch as Record<string, unknown>);
    await auditRollups(client);
  });

  test('a status change takes the row out of approved spend', async () => {
    const row = await recordExpenditure(travel);
    await editExpenditure(row.expenditure_id, { status: 'denied' });
    await auditRollups(client);
    expect(await approvedTotal()).toBe(0);
  });

  test('removeExpenditure decrements the bucket', async () => {
    await recordExpenditure(travel);
    const second = await recordExpenditure({ ...travel, amount: 100 });
    await removeExpenditure(second.expenditure_id);
    await auditRollups(client);
    expect(await approvedTotal()).toBe(250);
  });

  test('removeExpenditure on an unknown id is a no-op', async () => {
    await recordExpenditure(travel);
    expect(await removeExpenditure(999_999)).toBe(0n);
    await auditRollups(client);
    expect(await approvedTotal()).toBe(250);
  });

  test('deleting a project cascades without orphaning or resurrecting a bucket', async () => {
    await recordExpenditure({ ...travel, project_id: 4 });
    await recordReport({ project_id: 4, title: 'r', object_url: 's3://r', report_type: 'technical' });
    await removeProject(4);
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
  test('createProject seeds a zeroed rollup row', async () => {
    const created = await createProject(
      { name: 'fresh', description: 'x', total_budget: 500, currency: 'USD' },
      [],
      'Student',
    );
    await auditRollups(client);

    const rollup = await client.query(
      'SELECT * FROM branch.project_rollup WHERE project_id = $1',
      [created.project_id],
    );
    expect(rollup.rows).toHaveLength(1);
    expect(rollup.rows[0].member_count).toBe(0);
    expect(Number(rollup.rows[0].total_donated)).toBe(0);
  });

  test('donations add and remove', async () => {
    const donation = await recordDonation({ donor_id: 1, project_id: 1, amount: 500 });
    await auditRollups(client);
    await removeDonation(donation.donation_id);
    await auditRollups(client);
  });

  test('deleting a donor takes its donations off the rollup', async () => {
    await recordDonation({ donor_id: 1, project_id: 1, amount: 500 });
    await recordDonation({ donor_id: 1, project_id: 2, amount: 250 });
    await auditRollups(client);

    await removeDonor(1);
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT total_donated, donation_count FROM branch.project_rollup WHERE project_id IN (1, 2) ORDER BY project_id',
    );
    expect(rows.every((r) => Number(r.total_donated) === 0 && r.donation_count === 0)).toBe(true);
  });

  test('roster replacement keeps member_count in step', async () => {
    await updateProject(1, {}, [{ user_id: 1 }, { user_id: 2 }], 'Student');
    await auditRollups(client);
    await updateProject(1, {}, [{ user_id: 3 }], 'Student');
    await auditRollups(client);
    await updateProject(1, {}, [], 'Student');
    await auditRollups(client);
  });

  test('deleting a user takes its memberships off the rollup', async () => {
    await updateProject(1, {}, [{ user_id: 4 }], 'Student');
    await auditRollups(client);
    await removeUser(4);
    await auditRollups(client);
  });

  test('reports add and remove', async () => {
    await recordReport({ project_id: 1, title: 'a', object_url: 's3://a', report_type: 'technical' });
    const b = await recordReport({
      project_id: 1,
      title: 'b',
      object_url: 's3://b',
      report_type: 'narrative',
    });
    await auditRollups(client);

    const { rows } = await client.query(
      'SELECT report_count FROM branch.project_rollup WHERE project_id = 1',
    );
    expect(rows[0].report_count).toBe(2);

    await removeReport(b.report_id);
    await auditRollups(client);
  });
});
