import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');

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
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
};

const nonAdminAuthResult = {
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
      mockAuthenticateRequest.mockResolvedValue({ user: null as any, error: 'Missing or invalid Authorization header' });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain('Authorization');
    });

    test('403: authenticated non-admin is forbidden', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthResult as any);
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Admin access required');
    });
  });

  describe('Response shape', () => {
    beforeEach(() => {
      mockDb.selectFrom = jest.fn();
      // 1) totalSpent
      mockDb.selectFrom.mockReturnValueOnce(chain({ total: '18000.00' }));
      // 2) totalProjects
      mockDb.selectFrom.mockReturnValueOnce(chain({ count: '4' }));
      // 3) topCategory
      mockDb.selectFrom.mockReturnValueOnce(chain({ category: 'Travel', total: '6800.00' }));
      // 4) projectRows
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { project_id: 1, name: 'P1', total_budget: '500000.00', currency: 'USD' },
        { project_id: 2, name: 'P2', total_budget: '300000.00', currency: 'USD' },
        { project_id: 3, name: 'P3', total_budget: null, currency: 'USD' },
      ]));
      // 5) spentByProject
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { project_id: 1, total: '9200.00' },
        { project_id: 2, total: '4500.00' },
        { project_id: 3, total: '4300.00' },
      ]));
      // 6) staffByProject
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { project_id: 1, count: '2' },
        { project_id: 2, count: '1' },
      ]));
      // 7) raw expenditure rows (handler buckets by YYYY-MM in JS)
      mockDb.selectFrom.mockReturnValueOnce(chain([
        { spent_on: new Date('2025-02-10'), category: 'Travel', amount: '5000.00' },
        { spent_on: new Date('2025-03-22'), category: 'Travel Foreign', amount: '4200.00' },
      ]));
    });

    test('200: summary aggregates returned values', async () => {
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.summary.totalSpent).toBe(18000);
      expect(body.summary.totalProjects).toBe(4);
      expect(body.summary.averageSpendPerProject).toBe(4500);
      expect(body.summary.topExpenseCategory).toEqual({ category: 'Travel', amount: 6800 });
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

    test('200: expensesByMonth buckets raw rows into YYYY-MM', async () => {
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
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
      mockDb.selectFrom.mockReturnValueOnce(chain([]));
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
