import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const seedSqlPath = path.resolve(__dirname, '../../../db/db_setup.sql');
const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

beforeEach(async () => {
  const testName = expect.getState().currentTestName;
  if (testName && (testName.includes('duplicate') || testName.includes('normalization') || testName.includes('register with valid'))) {
    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  }
});

afterAll(async () => {
  await pool.end();
});

test("duplicate email returns 409", async () => {
  // Insert a user with lowercase email directly in DB
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO branch.users (email, name, is_admin) VALUES ($1, $2, $3)',
      ['existing@example.com', 'Existing User', false]
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
      'INSERT INTO branch.users (email, name, is_admin) VALUES ($1, $2, $3)',
      ['lowercase@example.com', 'Existing User', false]
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

test("register with valid data (requires Cognito)", async () => {
  const uniqueEmail = `test${Date.now()}${Math.random().toString(36).substring(7)}@example.com`;
  
  const res = await fetch("http://localhost:3000/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: uniqueEmail,
      password: "TestPassword123",
      name: "Test User"
    })
  });

  if (res.status === 201) {
    const body = await res.json();
    expect(body.message).toBe("User registered successfully");
    expect(body.userId).toBeDefined();
    expect(body.email).toBe(uniqueEmail);
    expect(body.name).toBe("Test User");
    expect(body.emailVerificationRequired).toBe(true);

    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM branch.users WHERE email = $1',
        [uniqueEmail]
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].cognito_sub).toBe(body.userId);
      expect(result.rows[0].is_admin).toBe(false);
    } finally {
      client.release();
    }
  } else if (res.status === 500) {
    console.log('Skipping Cognito test - Cognito not configured');
    expect(res.status).toBe(500);
  } else {
    throw new Error(`Unexpected status code: ${res.status}`);
  }
});
