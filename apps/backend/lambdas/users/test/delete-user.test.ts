import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'branch_dev',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_NAME ?? 'branch_db',
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


test("delete user test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/1", {
    method: "DELETE"
  });

  console.log(res);

  expect(res.status).toBe(200);
  let body = await res.json();


  expect(body.ok).toBe(true);
  expect(body.route).toBe("DELETE /users/{userId}");
  expect(body.pathParams.userId).toBe("1");

  let getRes = await fetch("http://localhost:3000/users/users/1");
  expect(getRes.status).toBe(404);
});

test("delete user 404 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/users/9999", {
    method: "DELETE"
  });

  expect(res.status).toBe(404);
});