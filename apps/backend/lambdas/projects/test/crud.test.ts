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

test("get project by id test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1")
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.project_id).toBe(1);
  expect(body.name).toContain("Clinician Communication Study");
});

test("project get 400 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1000", {
    method: "GET",
  });
  expect(res.status).toBe(404);
  let body = await res.json();
  expect(body.message).toBe("Project not found for id: 1000");
});

test("update project ignores protected fields 🌞", async () => {
  const beforeRes = await fetch("http://localhost:3000/projects/1");
  expect(beforeRes.status).toBe(200);
  const before = await beforeRes.json();

  const res = await fetch("http://localhost:3000/projects/1", {
    method: "PUT",
    body: JSON.stringify({
      name: "Project 1 Sanitized",
      project_id: 9999,
      created_at: "2000-01-01T00:00:00.000Z",
    }),
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.project_id).toBe(1);
  expect(body.name).toBe("Project 1 Sanitized");

  const afterRes = await fetch("http://localhost:3000/projects/1");
  expect(afterRes.status).toBe(200);
  const after = await afterRes.json();
  expect(after.project_id).toBe(1);
  expect(after.created_at).toBe(before.created_at);
});

test("delete project test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1", {
    method: "DELETE",
  });
  expect(res.status).toBe(200);
  let body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.pathParams.id).toBe("1");

  // confirm it's actually gone
  let getRes = await fetch("http://localhost:3000/projects/1");
  expect(getRes.status).toBe(404);
});

test("delete project 404 test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1000", {
    method: "DELETE",
  });
  expect(res.status).toBe(404);
  let body = await res.json();
  expect(body.message).toBe("Project not found");
});

test("delete project invalid id test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/abc", { method: "DELETE" });
  expect(res.status).toBe(400);
});

test("delete project with dependent expenditures test 🌞", async () => {
  let res = await fetch("http://localhost:3000/projects/1", { method: "DELETE" });
  expect(res.status).toBe(200);
  let body = await res.json();
  expect(body.ok).toBe(true);
});