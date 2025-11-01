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
  const client = await pool.connect();
  try {
    await client.query(seedSql);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
});

test("health test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/health")
  expect(res.status).toBe(200);
});

test("patch user test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/1", {
    method: "PATCH",
    body: JSON.stringify({
      name: "John Branch",
      email: "mrbranch@example.com",
      isAdmin: false
    })
  })
  expect(res.status).toBe(200);
  let body = await res.json().then(r => r.body);
  console.log(body);
  expect(body.email).toBe("mrbranch@example.com");
  expect(body.name).toBe("John Branch");
  expect(body.isAdmin).toBe(false);
});


test("patch user 404 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/4", {
    method: "PATCH",
    body: JSON.stringify({
      name: "John Doe",
      email: "john.doe@example.com"
    })
  })
  expect(res.status).toBe(404);
});