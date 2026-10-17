import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';
import { closeConnection, recordDonation, recordExpenditure, removeProject } from '@branch/store';

// Postgres blocks where DSQL aborts at commit: "waits" here means "conflicts" in prod.

const pool = new Pool({
  host: 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const KEY_SHARE_PROJECT = `SELECT project_id FROM branch.projects WHERE project_id = 1 AND deleted_at IS NULL FOR KEY SHARE`;

async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

describe('soft delete vs concurrent inserts', () => {
  let held: PoolClient;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await ensureSchema(client);
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await resetData(client);
    } finally {
      client.release();
    }
    held = await pool.connect();
  });

  afterEach(async () => {
    await held.query('ROLLBACK');
    held.release();
  });

  afterAll(async () => {
    await closeConnection();
    await pool.end();
  });

  test('an insert does not wait on another in-flight insert under the same project', async () => {
    await held.query('BEGIN');
    await held.query(KEY_SHARE_PROJECT);

    await expect(settlesWithin(recordExpenditure({ project_id: 1, amount: 10 }), 2000)).resolves.toBe(true);
  });

  test('a project delete waits for an in-flight insert, then stamps it', async () => {
    await held.query('BEGIN');
    await held.query(KEY_SHARE_PROJECT);
    const { rows } = await held.query(
      `INSERT INTO branch.expenditures (project_id, amount) VALUES (1, 10) RETURNING expenditure_id`,
    );

    const removal = removeProject(1);
    expect(await settlesWithin(removal, 300)).toBe(false);

    await held.query('COMMIT');
    await expect(removal).resolves.toBe(1n);

    const after = await pool.query(`SELECT deleted_at FROM branch.expenditures WHERE expenditure_id = $1`, [
      rows[0].expenditure_id,
    ]);
    expect(after.rows[0].deleted_at).not.toBeNull();
  });

  test('an insert waits for an in-flight project delete, then fails as a missing parent', async () => {
    await held.query('BEGIN');
    await held.query(`UPDATE branch.projects SET deleted_at = now() WHERE project_id = 1`);

    const insert = recordExpenditure({ project_id: 1, amount: 10 });
    expect(await settlesWithin(insert, 300)).toBe(false);

    await held.query('COMMIT');
    await expect(insert).rejects.toMatchObject({ code: '23503' });
  });

  test('a donation waits for an in-flight donor delete, then fails as a missing parent', async () => {
    await held.query('BEGIN');
    await held.query(`UPDATE branch.donors SET deleted_at = now() WHERE donor_id = 1`);

    const insert = recordDonation({ donor_id: 1, project_id: 1, amount: 10 });
    expect(await settlesWithin(insert, 300)).toBe(false);

    await held.query('COMMIT');
    await expect(insert).rejects.toMatchObject({ code: '23503' });
  });
});
