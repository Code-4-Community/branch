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
  let res = await fetch("http://localhost:3000/projects/health")
  expect(res.status).toBe(200);
});

test("get projects test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.length).toBeGreaterThan(0);
  body.forEach((project: any) => {
    expect(project.description).toBeDefined();
    expect(project.description).not.toBeNull();
    expect(typeof project.description).toBe('string');
  });
});
test("update project test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1", {
    method: "PUT",
    body: JSON.stringify({ name: "Project 1 Updated", total_budget: 2000 }),
  });
  expect(res.status).toBe(200);
  let body = await res.json();
  expect(body.project_id).toBe(1);
  expect(body.name).toContain("Project 1 Updated");
  expect(Number(body.total_budget)).toBe(Number(2000.00));
  expect(body.description).toBeDefined();
  expect(body.description).not.toBeNull();
  expect(typeof body.description).toBe('string');
});

test("update project with new description test 🌞", async () => {
  const newDesc = "Updated project description";
  let res = await fetch("http://localhost:3000/projects/1", {
    method: "PUT",
    body: JSON.stringify({ name: "Project 1", description: newDesc }),
  });
  expect(res.status).toBe(200);
  let body = await res.json();
  expect(body.description).toBe(newDesc);
});

test("project put 404 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1000", {
    method: "PUT",
    body: JSON.stringify({ name: "Project 1 Updated", total_budget: 2000 }),
  });
  expect(res.status).toBe(404);
  let body = await res.json();
  expect(body.message).toBe("Project not found for id: 1000");
});
