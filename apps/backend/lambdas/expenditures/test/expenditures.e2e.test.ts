import { test, expect, afterAll } from '@jest/globals';
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

afterAll(async () => {
  await pool.end();
});

test("health check", async () => {
  const res = await fetch("http://localhost:3000/expenditures/health");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("401: unauthenticated POST is rejected", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    body: JSON.stringify({
      projectID: 1,
      amount: 1500.50,
      category: "Travel",
      description: "Conference flight and hotel",
      spentOn: "2025-08-15"
    })
  });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.message).toBe("Authentication required");
});

test("401: POST with invalid token is rejected", async () => {
  const res = await fetch("http://localhost:3000/expenditures", {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-token",
    },
    body: JSON.stringify({
      projectID: 1,
      amount: 1000,
    })
  });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.message).toBe("Authentication required");
});
