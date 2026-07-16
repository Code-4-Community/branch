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


test("get projects no donors test 🌞", async () => { 
  const res = await fetch("http://localhost:3000/projects/4/donors");  
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.donors).toBeDefined();
  expect(Array.isArray(body.donors)).toBe(true);
});

test("get projects yes donors test 🌞", async () => { 
  const res = await fetch("http://localhost:3000/projects/1/donors");  
  expect(res.status).toBe(200);
  let body = await res.json();
  console.log(body);
  expect(body.donors).toBeDefined();
  expect(Array.isArray(body.donors)).toBe(true);
  if (body.donors.length > 0) {
    const donor = body.donors[0];
    expect(donor.project_id).toBeDefined();
    expect(donor.name).toBeDefined();
    expect(donor.total_budget).toBeDefined();
    expect(donor.start_date).toBeDefined();
    expect(donor.end_date).toBeDefined();
    expect(donor.currency).toBeDefined();
    expect(donor.created_at).toBeDefined();
    expect(donor.donation_id).toBeDefined();
    expect(donor.donor_id).toBeDefined();
    expect(donor.amount).toBeDefined();
    expect(donor.donated_at).toBeDefined();
    expect(donor.organization).toBeDefined();
    expect(donor.contact_name).toBeDefined();
    expect(donor.contact_email).toBeDefined();
  }
});


test("404 when invalid project id 🌞", async () => { 
  const res = await fetch("http://localhost:3000/projects/1000/donors");  
  expect(res.status).toBe(404);
});

test("400 when project id is not a number 🌞", async () => {
  const res = await fetch("http://localhost:3000/projects/abc/donors");
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("must be a valid number");
});

test("400 when request has both body and query params 🌞", async () => {
  const res = await fetch("http://localhost:3000/projects/1/donors?sort=desc");
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.message).toContain("Bad Request");
});