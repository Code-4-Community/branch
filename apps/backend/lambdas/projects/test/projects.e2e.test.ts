import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. Only the authenticate half
  // is faked: the subject is still loaded from the seeded memberships, which is
  // what makes "director" and "member of this project" mean anything here.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { loadRbacSubject } = jest.requireActual<typeof import('@branch/lambda-auth')>(
    '@branch/lambda-auth',
  );
  const db = jest.requireActual<typeof import('../db')>('../db').default;
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(
      authenticateRequest as never,
      (context) => loadRbacSubject(db as never, context),
    ),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;


const adminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const nonAdminAuthResult = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'student-sub', userId: 3, email: 'nour@branch.org', isAdmin: false },
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


// Non-admin users inserted by the Authorization block after each reseed.
// The seed creates users 1-3, so these deterministically become 4 and 5.
const nonMemberUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'nonmember-sub', userId: 4, email: 'nonmember@branch.org', isAdmin: false },
};

const directorMemberUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'director-sub', userId: 5, email: 'directormember@branch.org', isAdmin: false },
};

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
           ('Director Member', 'directormember@branch.org', FALSE)`,
      );
      await client.query(
        `INSERT INTO branch.project_memberships (project_id, user_id, role, start_date, hours)
         SELECT 1, user_id, 'Director', '2025-01-01', 10 FROM branch.users WHERE email = 'directormember@branch.org'`,
      );
    } finally {
      client.release();
    }
  });

  test('403: non-admin cannot create a project', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(postEvent({ name: 'Nope' }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
  });

  test('403: non-member cannot read a project', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonMemberUser);
    const res = await handler(getEvent('/projects/1'));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('You are not a member of this project');
  });

  test('200: admin lists every project', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult);
    const res = await handler(getEvent('/projects'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).length).toBe(4);
  });

  test('200: member lists only projects they belong to', async () => {
    mockAuthenticateRequest.mockResolvedValue(directorMemberUser);
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
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
  });

  test('200: Director member can read their project', async () => {
    mockAuthenticateRequest.mockResolvedValue(directorMemberUser);
    const res = await handler(getEvent('/projects/1'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).project_id).toBe(1);
  });

  // Directors lost project editing: `project:update` is admin-only. They keep
  // read access to the projects they are on, which the test above covers.
  test('403: Director member can no longer edit their project', async () => {
    mockAuthenticateRequest.mockResolvedValue(directorMemberUser);
    const res = await handler(putEvent('/projects/1', { name: 'Renamed by Director' }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
  });

  test('403: Director member cannot edit a project they do not belong to', async () => {
    mockAuthenticateRequest.mockResolvedValue(directorMemberUser);
    const res = await handler(putEvent('/projects/2', { name: 'X' }));
    expect(res.statusCode).toBe(403);
  });

  /**
   * The staff picker submits bare user ids, and "Director" is derived from these
   * rows, so defaulting an unspecified role to Student made every ordinary
   * project edit strip the project's directors of their role -- and with it the
   * donor roster -- with no UI to put it back.
   */
  test('an edit that does not mention roles leaves the existing ones alone', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

    const client = await pool.connect();
    let directorId: number;
    try {
      const { rows } = await client.query(
        `SELECT user_id FROM branch.users WHERE email = 'directormember@branch.org'`,
      );
      directorId = rows[0].user_id;
    } finally {
      client.release();
    }

    const res = await handler(
      putEvent('/projects/1', { name: 'Renamed by admin', members: [directorId] }),
    );
    expect(res.statusCode).toBe(200);

    const after = await pool.connect();
    try {
      const { rows } = await after.query(
        `SELECT role FROM branch.project_memberships WHERE project_id = 1 AND user_id = $1`,
        [directorId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe('Director');
    } finally {
      after.release();
    }
  });

  test('an explicit role in the payload still wins', async () => {
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult);

    const client = await pool.connect();
    let directorId: number;
    try {
      const { rows } = await client.query(
        `SELECT user_id FROM branch.users WHERE email = 'directormember@branch.org'`,
      );
      directorId = rows[0].user_id;
    } finally {
      client.release();
    }

    const res = await handler(
      putEvent('/projects/1', { members: [{ user_id: directorId, role: 'Student' }] }),
    );
    expect(res.statusCode).toBe(200);

    const after = await pool.connect();
    try {
      const { rows } = await after.query(
        `SELECT role FROM branch.project_memberships WHERE project_id = 1 AND user_id = $1`,
        [directorId],
      );
      expect(rows[0].role).toBe('Student');
    } finally {
      after.release();
    }
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

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult as any);

    const client = await pool.connect();
    try {
      await resetData(client);
      // Dashboard cards scope spend to the current calendar year and count
      // only active projects. Seed rows use 2025 spend dates and early-2026
      // end dates, so shift them forward for deterministic e2e assertions.
      await client.query(`
        UPDATE branch.projects
           SET end_date = '2099-12-31'
         WHERE end_date IS NOT NULL
      `);
      await client.query(`
        UPDATE branch.expenditures
           SET spent_on = make_date(
             EXTRACT(YEAR FROM CURRENT_DATE)::int,
             EXTRACT(MONTH FROM spent_on)::int,
             EXTRACT(DAY FROM spent_on)::int
           )
      `);
    } finally {
      client.release();
    }
  });

  test('401: unauthenticated request rejected 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(401);
  });

  test('403: non-admin is forbidden 🌞', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonAdminAuthResult);
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
  });

  test('summary aggregates seed totals 🌞', async () => {
    const res = await handler(dashboardEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.summary.totalProjects).toBe(4);
    // 14000, not the 18000 the seed spends: one denied and one pending row are
    // requests rather than spend and stay out of every total.
    expect(body.summary.totalSpent).toBe(14000);
    expect(body.summary.averageSpendPerProject).toBe(3500);
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