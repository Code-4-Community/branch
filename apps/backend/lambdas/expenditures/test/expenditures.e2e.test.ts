import { test, expect, beforeEach, afterAll } from '@jest/globals';
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
  let res = await fetch("http://localhost:3000/expenditures/health")
  expect(res.status).toBe(200);
});

test("post expenditure with all fields", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 1,
      enteredBy: 1,
      amount: 1500.50,
      category: "Travel",
      description: "Conference flight and hotel",
      spentOn: "2025-08-15"
    })
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.body.projectId).toBe(1);
  expect(body.body.enteredBy).toBe(1);
  expect(body.body.amount).toBe(1500.50);
  expect(body.body.category).toBe("Travel");
  expect(body.body.description).toBe("Conference flight and hotel");
  expect(body.body.spentOn).toBe("2025-08-15");
});

test("post expenditure with only required fields", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 2,
      amount: 2000
    })
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.body.projectId).toBe(2);
  expect(body.body.amount).toBe(2000);
  expect(body.body.enteredBy).toBeNull();
  expect(body.body.category).toBeNull();
});

test("post expenditure missing projectId", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      amount: 1000
    })
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("required");
});

test("post expenditure missing amount", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 1
    })
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("required");
});

test("post expenditure negative amount", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 1,
      amount: -500
    })
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("non-negative");
});

test("post expenditure project not found", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 999,
      amount: 1000
    })
  });
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.message).toBe("Project not found");
});

test("post expenditure with invalid spentOn date", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 1,
      amount: 1000,
      spentOn: "not-a-date"
    })
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("valid ISO date");
});

test("post expenditure user not found", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectId: 1,
      enteredBy: 999,
      amount: 1000
    })
  });
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.message).toBe("User not found");
});
