import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

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

jest.mock('../mailer');
import { sendExpenseStatusEmail } from '../mailer';
const mockSendExpenseStatusEmail = sendExpenseStatusEmail as jest.MockedFunction<typeof sendExpenseStatusEmail>;

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

// Non-admin user 1: has Director role on project 1
const directorUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'director-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: false,
  },
};

// Non-admin user 2: also has Director role on project 1
const secondDirectorUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'second-director-sub',
    userId: 2,
    email: 'renee@branch.org',
    isAdmin: false,
  },
};

// Non-admin user 3: has Student role on project 2, no role on project 1
const studentUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'student-sub',
    userId: 3,
    email: 'nour@branch.org',
    isAdmin: false,
  },
};

// Builds a Lambda event for GET or DELETE /expenditures/{id}
function idRequestEvent(method: 'GET' | 'DELETE', id: string | number) {
  return {
    rawPath: `/expenditures/${id}`,
    requestContext: { http: { method } },
    headers: { Authorization: 'Bearer fake-token' },
  };
}

// Looks up a real expenditure_id belonging to the given project from the
// freshly-seeded DB, so tests don't hardcode ids that could drift if the
// seed data changes. Throws error if none found
async function firstExpenditureId(projectId: number): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT expenditure_id FROM branch.expenditures WHERE project_id = $1 ORDER BY expenditure_id LIMIT 1',
      [projectId]
    );
    if (result.rows.length === 0) {
      throw new Error(`No seeded expenditure found for project_id=${projectId}`);
    }
    return result.rows[0].expenditure_id;
  } finally {
    client.release();
  }
}

// Directly queries the DB to confirm whether a row still exists
async function expenditureExists(id: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT 1 FROM branch.expenditures WHERE expenditure_id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

describe('Expenditures integration tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminUser);

    const client = await pool.connect();
    try {
      await resetData(client);
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
    test('201: Director can create expenditure on their project', async () => {
      mockAuthenticateRequest.mockResolvedValue(directorUser);

      const res = await handler(postEvent({ projectID: 1, amount: 500 }));
      expect(res.statusCode).toBe(201);
    });

    test('201: a second Director on the same project can create expenditure', async () => {
      mockAuthenticateRequest.mockResolvedValue(secondDirectorUser);

      // User 2 is also a Director on project 1
      const res = await handler(postEvent({ projectID: 1, amount: 750 }));
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).body.enteredBy).toBe(2);
    });

    test('403: Student cannot create expenditure on their project', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);

      const res = await handler(postEvent({ projectID: 2, amount: 500 }));
      expect(res.statusCode).toBe(403);
    });

    test('403: user with no membership on project is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);

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

  
  describe('GET /expenditures/{id}', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const id = await firstExpenditureId(1);

      const res = await handler(idRequestEvent('GET', id));
      expect(res.statusCode).toBe(401);
    });

    test('400: non-numeric id returns 400', async () => {
      const res = await handler(idRequestEvent('GET', 'not-a-number'));
      expect(res.statusCode).toBe(400);
    });

    test('404: unknown id returns 404', async () => {
      const res = await handler(idRequestEvent('GET', 999999));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Expenditure not found');
    });

    test('200: admin can fetch an expenditure by id', async () => {
      const id = await firstExpenditureId(1);
      const res = await handler(idRequestEvent('GET', id));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.body.expenditureId).toBe(id);
      expect(body.body.projectId).toBe(1);
    });

    test('403: student with no membership on the project cannot read it', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);
      const id = await firstExpenditureId(1); // studentUser has no role on project 1
    
      const res = await handler(idRequestEvent('GET', id));
      expect(res.statusCode).toBe(403);
    });
    
    test('200: student can read an expenditure on a project they have a role on', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);
      const id = await firstExpenditureId(2); // studentUser is Student on project 2
    
      const res = await handler(idRequestEvent('GET', id));
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /expenditures/{id}', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const id = await firstExpenditureId(1);

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(401);
      expect(await expenditureExists(id)).toBe(true);
    });

    test('400: non-numeric id returns 400', async () => {
      const res = await handler(idRequestEvent('DELETE', 'abc'));
      expect(res.statusCode).toBe(400);
    });

    test('404: unknown id returns 404', async () => {
      const res = await handler(idRequestEvent('DELETE', 999999));
      expect(res.statusCode).toBe(404);
    });

    test('403: Student cannot delete an expenditure on a project they have no role on', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);
      const id = await firstExpenditureId(1); // studentUser has no membership on project 1

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(403);
      expect(await expenditureExists(id)).toBe(true);
    });

    test('403: Student role on their own project is still not sufficient to delete', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentUser);
      const id = await firstExpenditureId(2); // studentUser is Student on project 2

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(403);
      expect(await expenditureExists(id)).toBe(true);
    });

    test('200: Director can delete an expenditure on their own project', async () => {
      mockAuthenticateRequest.mockResolvedValue(directorUser);
      const id = await firstExpenditureId(1);

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(200);
      expect(await expenditureExists(id)).toBe(false);
    });

    test('200: a second Director can delete an expenditure on their own project', async () => {
      mockAuthenticateRequest.mockResolvedValue(secondDirectorUser);
      const id = await firstExpenditureId(1);

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(200);
      expect(await expenditureExists(id)).toBe(false);
    });

    test('200: admin can delete an expenditure on any project', async () => {
      const id = await firstExpenditureId(2);

      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(200);
      expect(await expenditureExists(id)).toBe(false);
    });

    test('404: deleting the same expenditure twice returns 404 the second time', async () => {
      const id = await firstExpenditureId(1);

      const first = await handler(idRequestEvent('DELETE', id));
      expect(first.statusCode).toBe(200);

      const second = await handler(idRequestEvent('DELETE', id));
      expect(second.statusCode).toBe(404);
    });

    test('deleting one expenditure does not affect other rows', async () => {
      const client = await pool.connect();
      let totalBefore: number;
      try {
        const result = await client.query('SELECT COUNT(*)::int AS count FROM branch.expenditures');
        totalBefore = result.rows[0].count;
      } finally {
        client.release();
      }

      const id = await firstExpenditureId(1);
      const res = await handler(idRequestEvent('DELETE', id));
      expect(res.statusCode).toBe(200);

      const client2 = await pool.connect();
      try {
        const result = await client2.query('SELECT COUNT(*)::int AS count FROM branch.expenditures');
        expect(result.rows[0].count).toBe(totalBefore - 1);
      } finally {
        client2.release();
      }
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
      mockAuthenticateRequest.mockResolvedValue(studentUser);
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

    test('sends an approval email to the seeded submitter', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const id = await firstExpenditureId(1); // entered_by = 1 → ashley@branch.org
    
      const res = await handler(patchStatusEvent(id, { status: 'approved' }));
    
      expect(res.statusCode).toBe(200);
      expect(mockSendExpenseStatusEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ashley@branch.org', status: 'approved' }),
      );
    });
    
    test('does not send an email on needs_more_info', async () => {
      mockAuthenticateRequest.mockResolvedValue(adminUser);
      const id = await firstExpenditureId(1);
    
      const res = await handler(patchStatusEvent(id, { status: 'needs_more_info' }));
    
      expect(res.statusCode).toBe(200);
      expect(mockSendExpenseStatusEmail).not.toHaveBeenCalled();
    });
  });
});
