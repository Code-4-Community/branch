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

describe("Donor API with data", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  });

  test("health test 🌞", async () => {
    let res = await fetch("http://localhost:3000/donors/health");
    expect(res.status).toBe(200);
  });

  test("Status check for get all donors when donors exist 🌞", async () => {
    let res = await fetch("http://localhost:3000/donors", { method: "GET" });
    expect(res.status).toBe(200);
  });

  test("Content check for get all donors when donors exist 🌞", async () => {
    let res = await fetch("http://localhost:3000/donors", { method: "GET" });
    let body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);
  });
});

describe("Donor API when DB is empty", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE TABLE donors RESTART IDENTITY CASCADE;');
    } finally {
      client.release();
    }
  });

  test("Status check for get all donors when DB is empty", async () => {
    let res = await fetch("http://localhost:3000/donors", { method: "GET" });
    expect(res.status).toBe(200);
  });

  test("Content check for get all donors when DB is empty", async () => {
    let res = await fetch("http://localhost:3000/donors", { method: "GET" });
    let body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});

afterAll(async () => {
  await pool.end();
});
