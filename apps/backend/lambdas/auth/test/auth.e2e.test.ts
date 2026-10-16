import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

// Build schema "branch" from db/migrations if it isn't already current. Cheap
// (one SELECT) unless a migration was added since the schema was last built.
beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  const testName = expect.getState().currentTestName;
  if (testName && (testName.includes('duplicate') || testName.includes('normalization') || testName.includes('uninvited') || testName.includes('seeded admins'))) {
    const client = await pool.connect();
    try {
      await resetData(client);
    } finally {
      client.release();
    }
  }
});

afterAll(async () => {
  await pool.end();
});

test("seeded admins have a row but no Cognito identity", async () => {
  // Seed rows only; signing one in needs AdminCreateUser and a cognito_sub backfill.
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT email, user_id, is_admin, cognito_sub FROM branch.users WHERE is_admin IS TRUE ORDER BY user_id'
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.cognito_sub).toBeNull();
      expect(row.is_admin).toBe(true);
    }
    expect(rows.map((r: { email: string }) => r.email)).toEqual([
      'ashley@branch.org',
      'renee@branch.org',
      'nour@branch.org',
    ]);
  } finally {
    client.release();
  }
});
