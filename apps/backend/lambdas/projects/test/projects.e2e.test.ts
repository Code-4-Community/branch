import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
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

const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const nonAdminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'staff-sub', userId: 3, email: 'nour@branch.org', isAdmin: false },
};

// Non-admin users inserted by the Authorization block after each reseed.
// The seed creates users 1-3, so these deterministically become 4 and 5.
const nonMemberUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'nonmember-sub', userId: 4, email: 'nonmember@branch.org', isAdmin: false },
};

const piMemberUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'pi-sub', userId: 5, email: 'pimember@branch.org', isAdmin: false },
};

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

function postEvent(body: unknown) {
  return {
    rawPath: '/projects',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  } as any;
}

function getExpendituresEvent(id: string) {
  return {
    rawPath: `/projects/${id}/expenditures`,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
  } as any;
}

function getEvent(rawPath: string) {
  return {
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: {},
  } as any;
}

function putEvent(rawPath: string, body: unknown) {
  return {
    rawPath,
    requestContext: { http: { method: 'PUT' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  } as any;
}

describe('Authorization', () => {
  // Seed users are all admins, so add non-admin users to exercise the
  // membership-based paths in canCreateProject/canEditProject/canAccessProject.
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO branch.users (name, email, is_admin) VALUES
           ('Non Member', 'nonmember@branch.org', FALSE),
           ('PI Member', 'pimember@branch.org', FALSE)`,
      );
      await client.query(
        `INSERT INTO branch.project_memberships (project_id, user_id, role, start_date, hours)
         SELECT 1, user_id, 'PI', '2025-01-01', 10 FROM branch.users WHERE email = 'pimember@branch.org'`,
      );
    } finally {
      client.release();
    }
  });

  test('403: non-admin cannot create a project', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(postEvent({ name: 'Nope' }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Admin access required');
  });

  test('403: non-member cannot read a project', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(getEvent('/projects/1'));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('You do not have access to this project');
  });

  test('200: admin lists every project', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult);
    const res = await handler(getEvent('/projects'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).length).toBe(4);
  });

  test('200: member lists only projects they belong to', async () => {
    mockAuthenticateRequest.mockResolvedValue(piMemberUser);
    const res = await handler(getEvent('/projects'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBe(1);
    expect(body[0].project_id).toBe(1);
  });

  test('200: non-member lists no projects', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(getEvent('/projects'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).length).toBe(0);
  });

  test('403: non-member cannot edit a project', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(putEvent('/projects/1', { name: 'X' }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('You do not have access to edit this project');
  });

  test('200: PI member can read their project', async () => {
    mockAuthenticateRequest.mockResolvedValue(piMemberUser);
    const res = await handler(getEvent('/projects/1'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).project_id).toBe(1);
  });

  test('200: PI member can edit their project', async () => {
    mockAuthenticateRequest.mockResolvedValue(piMemberUser);
    const res = await handler(putEvent('/projects/1', { name: 'Renamed by PI' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('Renamed by PI');
  });

  test('403: PI member cannot edit a project they do not belong to', async () => {
    mockAuthenticateRequest.mockResolvedValue(piMemberUser);
    const res = await handler(putEvent('/projects/2', { name: 'X' }));
    expect(res.statusCode).toBe(403);
  });
});

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
  function dashboardEvent() {
    return {
      rawPath: '/dashboard',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: {},
    } as any;
  }

  test('401: unauthenticated request rejected 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(401);
  });

  test('403: non-admin is forbidden 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonAdminAuthResult);
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