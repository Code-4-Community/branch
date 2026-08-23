import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
// Memberships the mocked session should appear to have. Named `mock*` so it can
// be referenced from the jest.mock factory below.
const mockMemberships: Array<{ project_id: number; role: string }> = [];

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. This suite mocks ../db, so
  // the subject is assembled from the auth context and `mockMemberships`
  // instead of being read from Postgres -- same buildSubject either way.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { buildSubject } = jest.requireActual<typeof import('@branch/rbac')>('@branch/rbac');
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(authenticateRequest as never, async (context) =>
      buildSubject(context.user, mockMemberships),
    ),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

function getEvent() {
  return {
    rawPath: '/dashboard',
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: {},
  };
}

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

function chain(value: any) {
  const p: any = {};
  for (const m of [
    'select', 'selectAll', 'where', 'leftJoin', 'innerJoin',
    'groupBy', 'orderBy', 'limit', 'offset',
  ]) {
    p[m] = jest.fn().mockReturnValue(p);
  }
  p.execute = jest.fn().mockResolvedValue(value as any);
  p.executeTakeFirst = jest.fn().mockResolvedValue(value as any);
  return p;
}

describe('GET /dashboard unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthResult as any);
    mockDb.fn = {
      sum: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('sum') }),
      count: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
    };
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });

    test('403: authenticated non-admin is forbidden', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthResult as any);
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    });
  });

  describe('Response shape', () => {
    beforeEach(() => {
      mockDb.selectFrom = jest.fn();
      // 1) totalSpent (every project, this year)
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '18000.00' }));
      // 2) totalProjects (active only)
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '4' }));
      // 3) topCategory
      mockDb.selectFrom.mockReturnValueOnce(chain({ category: 'Travel', total: '6800.00' }));
      // 4) activeSpent — numerator of the average. Every project is active here,
      //    so it matches totalSpent and the average stays 18000/4.
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '18000.00' }));
      // 5) projectRows, with spend/headcount already joined by the database.
      //    P3 carries the LEFT JOIN misses as nulls.
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { project_id: 1, name: 'P1', total_budget: '500000.00', currency: 'USD', spent: '9200.00', staff_count: '2' },
        { project_id: 2, name: 'P2', total_budget: '300000.00', currency: 'USD', spent: '4500.00', staff_count: '1' },
        { project_id: 3, name: 'P3', total_budget: null, currency: 'USD', spent: '4300.00', staff_count: null },
      ]));
      // 6) expenses already grouped into YYYY-MM x category by the database
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { month: '2025-02', category: 'Travel', total: '5000.00' },
        { month: '2025-03', category: 'Travel Foreign', total: '4200.00' },
      ]));
    });

    test('200: summary aggregates returned values', async () => {
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.summary.totalSpent).toBe(18000);
      expect(body.summary.totalProjects).toBe(4);
      expect(body.summary.averageSpendPerProject).toBe(4500);
      expect(body.summary.topExpenseCategory).toEqual({
        category: 'Travel',
        amount: 6800,
        percentage: 37.78,
      });
    });

    test('200: response is stamped with the year the aggregates cover', async () => {
      const res = await handler(getEvent());
      expect(JSON.parse(res.body).year).toBe(new Date().getUTCFullYear());
    });

    test('200: projects breakdown joins spent and staff_count by project_id', async () => {
      const res = await handler(getEvent());
      const body = JSON.parse(res.body);
      expect(body.projects).toHaveLength(3);
      expect(body.projects[0]).toMatchObject({
        project_id: 1,
        name: 'P1',
        total_budget: 500000,
        spent: 9200,
        staff_count: 2,
      });
      expect(body.projects[0].spent_percentage).toBeCloseTo(1.84, 2);

      // project with no membership row -> staff_count 0
      expect(body.projects[2].staff_count).toBe(0);
      // project with null budget -> 0%
      expect(body.projects[2].total_budget).toBeNull();
      expect(body.projects[2].spent_percentage).toBe(0);
    });

    test('200: expensesByMonth passes through the database buckets', async () => {
      const res = await handler(getEvent());
      const body = JSON.parse(res.body);
      expect(body.expensesByMonth).toEqual([
        { month: '2025-02', category: 'Travel', amount: 5000 },
        { month: '2025-03', category: 'Travel Foreign', amount: 4200 },
      ]);
    });

    test('200: response has CORS + JSON headers', async () => {
      const res = await handler(getEvent());
      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Edge cases', () => {
    test('200: empty database returns zeros and null topExpenseCategory', async () => {
      mockDb.selectFrom = jest.fn();
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: null }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '0' }));
      mockDb.selectFrom.mockReturnValueOnce(chain(undefined));
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: null }));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));

      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.summary.totalSpent).toBe(0);
      expect(body.summary.totalProjects).toBe(0);
      expect(body.summary.averageSpendPerProject).toBe(0);
      expect(body.summary.topExpenseCategory).toBeNull();
      expect(body.projects).toEqual([]);
      expect(body.expensesByMonth).toEqual([]);
    });

    test('200: top category percentage is 0 rather than NaN when nothing was spent', async () => {
      mockDb.selectFrom = jest.fn();
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '0' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '2' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ category: 'Travel', total: '0' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '0' }));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));

      const res = await handler(getEvent());
      const body = JSON.parse(res.body);
      expect(body.summary.topExpenseCategory.percentage).toBe(0);
    });

    test('200: average aggregates active projects only, on both sides of the divide', async () => {
      mockDb.selectFrom = jest.fn();
      // 18000 spent this year across every project...
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '18000.00' }));
      // ...but only 4 projects are still active...
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '4' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ category: 'Travel', total: '6800.00' }));
      // ...and only 12000 of that spend belongs to them.
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '12000.00' }));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));

      const body = JSON.parse((await handler(getEvent())).body);
      // 12000/4, not 18000/4: the 6000 belonging to projects that have already
      // ended is out of the numerator, matching the denominator.
      expect(body.summary.averageSpendPerProject).toBe(3000);
      // The headline total still reports every project's spend.
      expect(body.summary.totalSpent).toBe(18000);
    });

    test('200: average is 0 when active projects exist but none of them spent', async () => {
      mockDb.selectFrom = jest.fn();
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '5000.00' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '3' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ category: 'Travel', total: '5000.00' }));
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: null }));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));

      const body = JSON.parse((await handler(getEvent())).body);
      expect(body.summary.averageSpendPerProject).toBe(0);
    });

    test('500: db failure surfaces as 500', async () => {
      mockDb.selectFrom = jest.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('Failed to load dashboard');
    });
  });
});
