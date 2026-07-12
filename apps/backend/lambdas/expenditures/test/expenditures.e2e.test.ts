import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// mock auth only for now
jest.mock('../auth');

import { handler } from '../handler';
import { authenticateRequest, checkAuthorization } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockCheckAuthorization = checkAuthorization as jest.MockedFunction<typeof checkAuthorization>;

mockCheckAuthorization.mockImplementation((authContext, requiredAccess, resourceUserId?) => {
  if (requiredAccess === 'PUBLIC') return { allowed: true };
  if (!authContext.isAuthenticated || !authContext.user) return { allowed: false, reason: 'Authentication required' };
  if (requiredAccess === 'ADMIN') {
    const isAdmin = authContext.user.isAdmin ?? false;
    return { allowed: isAdmin, reason: isAdmin ? undefined : 'Admin access required' };
  }
  if (requiredAccess === 'ADMIN_OR_SELF') {
    const allowed = (authContext.user.isAdmin ?? false) || authContext.user.userId === Number(resourceUserId);
    return { allowed, reason: allowed ? undefined : 'Admin access or resource ownership required' };
  }
  return { allowed: false, reason: 'Unknown access level' };
});

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

// Helper to create Lambda events
function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/expenditures',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

function getEvent(path: string, queryStringParameters?: Record<string, string>) {
  return {
    rawPath: path,
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: queryStringParameters ?? {},
  };
}

function patchStatusEvent(id: number | string, body: Record<string, unknown>) {
  return {
    rawPath: `/expenditures/${id}/status`,
    requestContext: { http: { method: 'PATCH' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

// Auth contexts based on seed data
const adminUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
};

// Non-admin user 1: has PI role on project 1
const piUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'pi-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: false,
  },
};

// Non-admin user 2: has Accountant role on project 1
const accountantUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'accountant-sub',
    userId: 2,
    email: 'renee@branch.org',
    isAdmin: false,
  },
};

// Non-admin user 3: has Staff role on project 2, no role on project 1
const staffUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'staff-sub',
    userId: 3,
    email: 'nour@branch.org',
    isAdmin: false,
  },
};

describe('Expenditures integration tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminUser);

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

  describe('Health check', () => {
    test('200: health check returns ok', async () => {
      const res = await handler(getEvent('/expenditures/health'));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });

      const res = await handler(postEvent({ projectID: 1, amount: 1000 }));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });

    test('401: GET /expenditures rejects unauthenticated request', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });

      const res = await handler(getEvent('/'));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Authorization', () => {
    test('201: PI can create expenditure on their project', async () => {
      mockAuthenticateRequest.mockResolvedValue(piUser);

      const res = await handler(postEvent({ projectID: 1, amount: 500 }));
      expect(res.statusCode).toBe(201);
    });

    test('201: Accountant can create expenditure on their project', async () => {
      mockAuthenticateRequest.mockResolvedValue(accountantUser);

      // User 2 is Accountant on project 1
      const res = await handler(postEvent({ projectID: 1, amount: 750 }));
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).body.enteredBy).toBe(2);
    });

    test('403: Staff cannot create expenditure on their project', async () => {
      mockAuthenticateRequest.mockResolvedValue(staffUser);

      const res = await handler(postEvent({ projectID: 2, amount: 500 }));
      expect(res.statusCode).toBe(403);
    });

    test('403: user with no membership on project is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(staffUser);

      // User 3 has no membership on project 1
      const res = await handler(postEvent({ projectID: 1, amount: 500 }));
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Success cases', () => {
    test('201: admin creates expenditure with all fields', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1500.50,
          category: 'Travel',
          description: 'Conference flight and hotel',
          spentOn: '2025-08-15',
        })
      );

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.body.projectID).toBe(1);
      expect(body.body.enteredBy).toBe(1);
      expect(body.body.amount).toBe(1500.50);
      expect(body.body.category).toBe('Travel');
      expect(body.body.description).toBe('Conference flight and hotel');
      expect(body.body.spentOn).toBe('2025-08-15');

      // Verify the row was actually written to the DB
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT * FROM branch.expenditures WHERE category = 'Travel' AND amount = 1500.50"
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].entered_by).toBe(1);
        expect(result.rows[0].project_id).toBe(1);
      } finally {
        client.release();
      }
    });

    test('201: admin creates expenditure with required fields only', async () => {
      const res = await handler(postEvent({ projectID: 2, amount: 2000 }));

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.body.projectID).toBe(2);
      expect(body.body.amount).toBe(2000);
      expect(body.body.category).toBeNull();
    });

    test('201: creates expenditure with status and receipt_url', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 300,
          status: 'approved',
          receipt_url: 'https://s3.amazonaws.com/branch-receipts/receipt.pdf',
        })
      );

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.body.status).toBe('approved');
      expect(body.body.receiptUrl).toBe('https://s3.amazonaws.com/branch-receipts/receipt.pdf');

      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT * FROM branch.expenditures WHERE amount = 300 AND project_id = 1"
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].status).toBe('approved');
        expect(result.rows[0].receipt_url).toBe('https://s3.amazonaws.com/branch-receipts/receipt.pdf');
      } finally {
        client.release();
      }
    });

    test('201: status defaults to pending when omitted', async () => {
      const res = await handler(postEvent({ projectID: 1, amount: 100 }));

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).body.status).toBe('pending');

      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT * FROM branch.expenditures WHERE amount = 100 AND project_id = 1"
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].status).toBe('pending');
        expect(result.rows[0].receipt_url).toBeNull();
      } finally {
        client.release();
      }
    });

    test('404: project not found', async () => {
      const res = await handler(postEvent({ projectID: 999, amount: 1000 }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });
  });

  describe('Input validation', () => {
    test('400: invalid status value returns 400', async () => {
      const res = await handler(postEvent({ projectID: 1, amount: 500, status: 'unknown' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('status must be one of');
    });

    test('400: empty string receipt_url returns 400', async () => {
      const res = await handler(postEvent({ projectID: 1, amount: 500, receipt_url: '' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('receipt_url');
    });
  });

  describe('GET /expenditures — list and pagination', () => {
    test('200: returns all expenditures with data envelope', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/'));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(6);
      expect(body.pagination).toBeUndefined();
    });

    test('200: ordered newest first by spent_on', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/'));
      const body = JSON.parse(res.body);
      const dates = body.data.map((e: any) => new Date(e.spent_on).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });

    test('200: paginated response with page and limit', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '1', limit: '1' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(1);
      expect(body.pagination.totalItems).toBe(6);
      expect(body.pagination.totalPages).toBe(6);
    });

    test('200: page 2 returns second item', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '2', limit: '1' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.pagination.page).toBe(2);
    });

    test('200: limit larger than total returns all items', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '1', limit: '100' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.length).toBe(6);
      expect(body.pagination.totalItems).toBe(6);
      expect(body.pagination.totalPages).toBe(1);
    });

    test('200: only page provided returns all without pagination', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '1' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.pagination).toBeUndefined();
      expect(body.data.length).toBe(6);
    });

    test('200: only limit provided returns all without pagination', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { limit: '2' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.pagination).toBeUndefined();
      expect(body.data.length).toBe(6);
    });

    test('200: filter by projectId returns only matching expenditures', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { projectId: '1' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.every((e: any) => e.project_id === 1)).toBe(true);
    });

    test('200: projectId filter with pagination', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { projectId: '1', page: '1', limit: '10' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.pagination.totalItems).toBe(2);
      expect(body.data.every((e: any) => e.project_id === 1)).toBe(true);
    });

    test('400: page=0 returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '0', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: negative page returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '-1', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: non-integer page returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: 'abc', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: limit=0 returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '1', limit: '0' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: decimal limit returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { page: '1', limit: '1.5' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: invalid projectId returns 400', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(getEvent('/', { projectId: 'abc' }));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /expenditures/{id}/status — approve/decline', () => {
    async function getStatus(id: number): Promise<string | undefined> {
      const result = await pool.query('SELECT status FROM branch.expenditures WHERE expenditure_id = $1', [id]);
      return result.rows[0]?.status;
    }

    test('200: admin approves a pending expenditure', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(patchStatusEvent(1, { status: 'approved' }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).body.status).toBe('approved');
      // confirms it persisted to the database
      expect(await getStatus(1)).toBe('approved');
    });

    test('200: admin declines a pending expenditure', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(patchStatusEvent(1, { status: 'denied' }));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).body.status).toBe('denied');
      expect(await getStatus(1)).toBe('denied');
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(patchStatusEvent(1, { status: 'approved' }));

      expect(res.statusCode).toBe(401);
      expect(await getStatus(1)).toBe('pending');
    });

    test('403: non-admin user is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(staffUser);
      const res = await handler(patchStatusEvent(1, { status: 'approved' }));

      expect(res.statusCode).toBe(403);
      expect(await getStatus(1)).toBe('pending');
    });

    test('404: expenditure not found', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(patchStatusEvent(9999, { status: 'approved' }));

      expect(res.statusCode).toBe(404);
    });

    test('400: status not valid is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(patchStatusEvent(1, { status: 'pend' }));

      expect(res.statusCode).toBe(400);
      expect(await getStatus(1)).toBe('pending');
    });

    test('400: invalid id is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const res = await handler(patchStatusEvent('abc', { status: 'approved' }));

      expect(res.statusCode).toBe(400);
    });
  });
});
