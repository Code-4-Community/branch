import { test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

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

// Build schema "branch" from db/migrations if it isn't already current. Cheap
// (one SELECT) unless a migration was added since the schema was last built.
beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});


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
    await resetData(client);
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
