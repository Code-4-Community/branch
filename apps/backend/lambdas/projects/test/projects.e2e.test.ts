import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

jest.mock('../auth');

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const adminAuthResult = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
};

const nonAdminAuthResult = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'staff-sub',
    userId: 3,
    email: 'nour@branch.org',
    isAdmin: false,
  },
};

beforeAll(() => {
  process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
  process.env.DB_PORT = process.env.DB_PORT ?? '5432';
  process.env.DB_USER = process.env.DB_USER ?? 'branch_dev';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'password';
  process.env.DB_NAME = process.env.DB_NAME ?? 'branch_db';
});

function postEvent(body: unknown) {
  return {
    rawPath: '/projects',
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify(body),
  } as any;
}

function getExpendituresEvent(id: string) {
  return {
    rawPath: `/projects/${id}/expenditures`,
    requestContext: { http: { method: 'GET' } },
  } as any;
}

describe('POST /projects (e2e)', () => {
  test('201 creates project with number budget', async () => {
    const res = await handler(postEvent({ name: 'Proj A', total_budget: 1000 }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('Proj A');
    expect(json.project_id).toBeDefined();
  });

  test('201 creates project with numeric string budget', async () => {
    const res = await handler(postEvent({ name: 'Proj B', total_budget: '2500.50' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('Proj B');
  });

  test('201: creates project with all fields (e2e)', async () => {
    const res = await handler(postEvent({
      name: 'AllFieldsE2E',
      total_budget: '2500.50',
      start_date: '2025-03-01',
      end_date: '2025-09-30',
      currency: 'EUR',
      description: 'End-to-end project description',
    }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('AllFieldsE2E');
    expect(json.total_budget).toBeDefined();
    expect(json.start_date).toContain('2025-03-01');
    expect(json.end_date).toContain('2025-09-30');
    expect(json.currency).toBe('EUR');
    expect(json.description).toBe('End-to-end project description');
  });

  test('400 when name missing', async () => {
    const res = await handler(postEvent({ total_budget: 10 }));
    expect(res.statusCode).toBe(400);
  });

  test('400 when total_budget invalid', async () => {
    const res = await handler(postEvent({ name: 'X', total_budget: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  test('201 with only required name (optional omitted)', async () => {
    const res = await handler(postEvent({ name: 'Minimal' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe(''); // description defaults to empty string
  });

  test('201: creates project with empty string description', async () => {
    const res = await handler(postEvent({ name: 'EmptyDesc', description: '' }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe('');
  });

  test('400: description exceeds 1000 characters', async () => {
    const longDesc = 'a'.repeat(1001);
    const res = await handler(postEvent({ name: 'LongDesc', description: longDesc }));
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.message).toContain('1000');
  });

  test('201: creates project with exactly 1000 character description', async () => {
    const desc1000 = 'a'.repeat(1000);
    const res = await handler(postEvent({ name: 'MaxDesc', description: desc1000 }));
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.description).toBe(desc1000);
  });
});

describe('GET /projects/{id}/expenditures (e2e)', () => {
  test('get expenditures for project 1 test 🌞', async () => {
    const res = await handler(getExpendituresEvent('1'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  test('expenditures 404 test 🌞', async () => {
    const res = await handler(getExpendituresEvent('99999'));
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Project not found');
  });

  test('expenditures ordered by spent_on test 🌞', async () => {
    const res = await handler(getExpendituresEvent('1'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    if (body.length > 1) {
      for (let i = 0; i < body.length - 1; i++) {
        const current = new Date(body[i].spent_on);
        const next = new Date(body[i + 1].spent_on);
        expect(current >= next).toBe(true);
      }
    }
  });
});

describe('GET /dashboard (e2e)', () => {
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

  function dashboardEvent() {
    return {
      rawPath: '/dashboard',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: {},
    } as any;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult as any);

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

  test('401: unauthenticated request rejected 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(401);
  });

  test('403: non-admin is forbidden 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonAdminAuthResult as any);
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Admin access required');
  });

  test('summary aggregates seed totals 🌞', async () => {
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.summary.totalProjects).toBe(4);
    expect(body.summary.totalSpent).toBe(18000);
    expect(body.summary.averageSpendPerProject).toBe(4500);
  });

  test('topExpenseCategory is highest-summed category 🌞', async () => {
    const res = await handler(dashboardEvent());
    const body = JSON.parse(res.body);
    expect(body.summary.topExpenseCategory).not.toBeNull();
    expect(body.summary.topExpenseCategory.category).toBe('Travel');
    expect(body.summary.topExpenseCategory.amount).toBe(6800);
  });

  test('projects breakdown returns budget, spent and staff_count per project 🌞', async () => {
    const res = await handler(dashboardEvent());
    const body = JSON.parse(res.body);
    expect(body.projects.length).toBe(4);

    const p1 = body.projects.find((p: any) => p.project_id === 1);
    expect(p1.name).toContain('Clinician Communication Study');
    expect(p1.total_budget).toBe(500000);
    expect(p1.spent).toBe(9200);
    expect(p1.staff_count).toBe(2);
    expect(p1.spent_percentage).toBeCloseTo(1.84, 2);
  });

  test('projects with no expenditures or members report zeros 🌞', async () => {
    const res = await handler(dashboardEvent());
    const body = JSON.parse(res.body);
    const projB = body.projects.find((p: any) => p.name === 'Proj B');
    expect(projB).toBeDefined();
    expect(projB.spent).toBe(0);
    expect(projB.staff_count).toBe(0);
  });

  test('expensesByMonth rows are chronological with numeric amounts 🌞', async () => {
    const res = await handler(dashboardEvent());
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.expensesByMonth)).toBe(true);
    expect(body.expensesByMonth.length).toBeGreaterThan(0);

    for (let i = 0; i < body.expensesByMonth.length - 1; i++) {
      expect(body.expensesByMonth[i].month <= body.expensesByMonth[i + 1].month).toBe(true);
    }

    body.expensesByMonth.forEach((row: any) => {
      expect(typeof row.month).toBe('string');
      expect(typeof row.amount).toBe('number');
    });
  });
});

afterAll(async () => {
  await db.destroy();
});