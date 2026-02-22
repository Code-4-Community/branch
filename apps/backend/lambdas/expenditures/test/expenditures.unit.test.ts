import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database module BEFORE importing handler
jest.mock('../db');
jest.mock('../auth');

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

// Helper function to create a POST event
function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/expenditures',
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    headers: {
      Authorization: 'Bearer fake-token',
    },
    body: JSON.stringify(body),
  };
}

// Default authenticated admin user
const adminAuthContext = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'test-sub',
    userId: 1,
    email: 'admin@example.com',
    isAdmin: true,
  },
};

describe('POST /expenditures unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: requests are from an authenticated admin
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  describe('Authentication & Authorization', () => {
    test('401: unauthenticated request', async () => {
      mockAuthenticateRequest.mockResolvedValue({
        isAuthenticated: false,
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Authentication required');
    });

    test('403: user without required project role', async () => {
      mockAuthenticateRequest.mockResolvedValue({
        isAuthenticated: true,
        user: {
          cognitoSub: 'staff-sub',
          userId: 2,
          email: 'staff@example.com',
          isAdmin: false,
        },
      });

      // Mock: no membership found for this user on this project
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              executeTakeFirst: jest.fn().mockReturnValue(null as any),
            }),
          }),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('Unable to create expenditure');
    });

    test('403: user with Staff role is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({
        isAuthenticated: true,
        user: {
          cognitoSub: 'staff-sub',
          userId: 2,
          email: 'staff@example.com',
          isAdmin: false,
        },
      });

      // Mock: user has Staff role
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              executeTakeFirst: jest.fn().mockReturnValue({ role: 'Staff' } as any),
            }),
          }),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Input Validation', () => {
    test('400: missing projectID field', async () => {
      const res = await handler(
        postEvent({
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: missing amount field', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: projectID is not an integer', async () => {
      const res = await handler(
        postEvent({
          projectID: 'one',
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('integer');
    });

    test('400: amount is not a number', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 'one thousand',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('number');
    });

    test('400: amount is negative', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: -500,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('non-negative');
    });

    test('400: category is empty string', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
          category: '',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
    });
  });

  describe('Response Format', () => {
    test('404: POST to invalid path returns not found', async () => {
      const res = await handler({
        rawPath: '/invalid',
        requestContext: {
          http: {
            method: 'POST',
          },
        },
        body: JSON.stringify({
          projectID: 1,
          amount: 1000,
        }),
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Not Found');
      expect(json).toHaveProperty('path');
      expect(json).toHaveProperty('method');
    });

    test('response has correct HTTP headers', async () => {
      // Setup mocks for successful expenditure creation
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue({
              project_id: 1,
              name: 'Test Project',
              total_budget: 50000,
            } as any),
          }),
        }),
      });

      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(undefined as any),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers?.['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
      expect(res.headers?.['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('Success Cases', () => {
    test('201: successful POST returns 201 status and correct response shape', async () => {
      // Mock: project exists
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue({
              project_id: 1,
              name: 'Test Project',
            } as any),
          }),
        }),
      });

      // Mock: insert succeeds
      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(undefined as any),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1500.50,
          category: 'Travel',
          description: 'Conference flight',
        })
      );

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('ok');
      expect(json).toHaveProperty('route');
      expect(json).toHaveProperty('body');
      expect(json.body).toHaveProperty('projectID');
      expect(json.body).toHaveProperty('amount');
      expect(json.body.enteredBy).toBe(1); // authenticated user's ID
    });

    test('404: returns 404 when project not found', async () => {
      // Mock: project doesn't exist
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue(null as any),
          }),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 999,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('message');
    });

    test('201: handles optional fields correctly', async () => {
      // Mock: project exists
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue({
              project_id: 2,
              name: 'Another Project',
            } as any),
          }),
        }),
      });

      // Mock: insert succeeds
      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(undefined as any),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 2,
          amount: 2000,
        })
      );

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.ok).toBe(true);
      expect(json.body.projectID).toBe(2);
      expect(json.body.amount).toBe(2000);
    });
  });

  describe('Error Handling', () => {
    test('500: returns 500 when database insert fails', async () => {
      // Mock: project exists
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockReturnValue({
              project_id: 1,
              name: 'Test Project',
            } as any),
          }),
        }),
      });

      // Mock: insert throws error
      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockRejectedValue(new Error('Database connection failed')),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(500);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Failed to create expenditure');
    });

    test('500: returns 500 when project lookup fails', async () => {
      // Mock: project lookup throws error
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: (jest.fn() as any).mockRejectedValue(new Error('Database error')),
          }),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
        })
      );

      expect(res.statusCode).toBe(500);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Internal Server Error');
    });
  });
});
