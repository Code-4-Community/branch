import { test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

jest.mock('../auth', () => ({
  ...jest.requireActual<typeof import('../auth')>('../auth'),
  authenticateRequest: jest.fn(),
}));

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

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

function getDonorsEvent(rawPath: string, queryStringParameters: Record<string, string> = {}) {
  return {
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters,
  } as any;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

  const client = await pool.connect();
  try {
    await client.query(seedSql);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
  await db.destroy();
});

test("health test 🌞", async () => {
  const res = await handler(getDonorsEvent('/projects/health'));
  expect(res.statusCode).toBe(200);
});

test("get projects no donors test 🌞", async () => {
  const res = await handler(getDonorsEvent('/projects/4/donors'));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.donors).toBeDefined();
  expect(Array.isArray(body.donors)).toBe(true);
});

test("get projects yes donors test 🌞", async () => {
  const res = await handler(getDonorsEvent('/projects/1/donors'));
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
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
  const res = await handler(getDonorsEvent('/projects/1000/donors'));
  expect(res.statusCode).toBe(404);
});

test("400 when project id is not a number 🌞", async () => {
  const res = await handler(getDonorsEvent('/projects/abc/donors'));
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("must be a valid number");
});

test("400 when request has both body and query params 🌞", async () => {
  const res = await handler(getDonorsEvent('/projects/1/donors', { sort: 'desc' }));
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.message).toContain("Bad Request");
});
