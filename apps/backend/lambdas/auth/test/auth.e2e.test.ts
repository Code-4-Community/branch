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

test("duplicate email returns 409", async () => {
  // A CLAIMED row (cognito_sub set) is a genuine conflict. A row without one is
  // a pending invitation and would be claimed instead -- see the test below.
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO branch.users (email, name, is_admin, cognito_sub) VALUES ($1, $2, $3, $4)',
      ['existing@example.com', 'Existing User', false, 'existing-sub-123']
    );
  } finally {
    client.release();
  }

  // Try to register with same email
  const res = await fetch("http://localhost:3000/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "existing@example.com",
      password: "TestPassword123",
      name: "New User"
    })
  });

  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.message).toContain("already exists");
});

test("email normalization uppercase matches lowercase in DB", async () => {
  // Insert a user with lowercase email
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO branch.users (email, name, is_admin, cognito_sub) VALUES ($1, $2, $3, $4)',
      ['lowercase@example.com', 'Existing User', false, 'lowercase-sub-123']
    );
  } finally {
    client.release();
  }

  // Try to register with uppercase version
  const res = await fetch("http://localhost:3000/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "LOWERCASE@EXAMPLE.COM",
      password: "TestPassword123",
      name: "New User"
    })
  });

  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.message).toContain("already exists");
});

test("uninvited email is refused before Cognito is ever called", async () => {
  // Registration is invitation-only: with no branch.users row for this address
  // the request must be rejected outright. Previously this created a working
  // account for any caller.
  const uniqueEmail = `test${Date.now()}${Math.random().toString(36).substring(7)}@example.com`;

  const res = await fetch("http://localhost:3000/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: uniqueEmail,
      password: "TestPassword123",
      name: "Test User"
    })
  });

  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.code).toBe("INVITATION_REQUIRED");

  // And nothing was written.
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT 1 FROM branch.users WHERE email = $1',
      [uniqueEmail]
    );
    expect(rows).toHaveLength(0);
  } finally {
    client.release();
  }
});

test("seeded admins are pending invitations, not claimed accounts", async () => {
  // The claim path depends on this contract: a seeded admin has a row but no
  // Cognito identity, so /auth/register activates it instead of 409ing. Before
  // claim-on-register these three could never sign in at all.
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT email, user_id, is_admin, cognito_sub FROM branch.users ORDER BY user_id'
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
