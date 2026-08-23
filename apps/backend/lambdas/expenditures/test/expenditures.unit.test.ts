import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database module BEFORE importing handler
jest.mock('../db');
// Memberships the mocked session should appear to have. Named `mock*` so it can
// be referenced from the jest.mock factory below.
// Mutated per test to give the mocked session memberships. `beforeEach` in each
// describe empties it, so a subject built in one test cannot leak into the next.
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

// Presigning must not reach AWS in unit tests.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.example/url'),
}));

// Nor must the receipt delete on DELETE /expenditures/{id}. Shared across
// instances so the assertions below can see the call.
const mockS3Send = jest.fn<(command: unknown) => Promise<unknown>>();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
  GetObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((params: unknown) => ({ __type: 'DeleteObject', ...(params as object) })),
}));

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

function getEvent(queryStringParameters?: Record<string, string>) {
  return {
    rawPath: '/',
    requestContext: {
      http: {
        method: 'GET',
      },
    },
    headers: {
      Authorization: 'Bearer fake-token',
    },
    queryStringParameters: queryStringParameters ?? {},
  };
}

// Builds a Lambda event for GET or DELETE /expenditures/{id}
function idEvent(method: 'GET' | 'DELETE', id: string) {
  return {
    rawPath: `/expenditures/${id}`,
    requestContext: { http: { method } },
    headers: { Authorization: 'Bearer fake-token' },
  };
}

const studentAuthContext = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'student-sub', userId: 2, email: 'student@example.com', isAdmin: false },
};

const directorAuthContext = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'director-sub', userId: 3, email: 'director@example.com', isAdmin: false },
};

const fakeExpenditure = {
  expenditure_id: 5,
  project_id: 1,
  entered_by: 1,
  amount: '1200',
  category: 'Travel',
  description: 'Flight',
  status: 'pending',
  receipt_url: null,
  spent_on: new Date('2025-06-01'),
  created_at: new Date('2025-06-01'),
};

// Mocks the query chain used by the handler to fetch a single expenditure
function mockSelectExpenditure(result: any, name?: string) {
  return {
    where: jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
        executeTakeFirst: jest.fn().mockReturnValue(result),
      }),
      // GET /expenditures/{id} also looks up the submitter and project names.
      select: jest.fn().mockReturnValue({
        executeTakeFirst: jest.fn().mockReturnValue(name ? { name } : undefined),
      }),
    }),
  };
}

// Mocks the query chain used by the handler to check project membership
function mockMembership(result: any) {
  return {
    where: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(result),
        }),
      }),
    }),
  };
}

// Mocks the query chain used by the handler to delete an expenditure
function mockDelete(numDeletedRows: bigint) {
  return {
    where: jest.fn().mockReturnValue({
      execute: jest.fn().mockReturnValue([{ numDeletedRows }]),
    }),
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

const fakeExpenditures = [
  { expenditure_id: 3, project_id: 1, amount: '2500', category: 'Supplies', spent_on: new Date('2025-07-12') },
  { expenditure_id: 2, project_id: 2, amount: '3000', category: 'Equipment', spent_on: new Date('2025-04-05') },
  { expenditure_id: 1, project_id: 1, amount: '5000', category: 'Travel', spent_on: new Date('2025-02-10') },
];

describe('POST /expenditures unit tests', () => {
  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    // Default: requests are from an authenticated admin
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    // db.fn is used by GET pagination queries: count() scoped, sum() unscoped.
    mockDb.fn = {
      count: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
      sum: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
    };
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
          cognitoSub: 'student-sub',
          userId: 2,
          email: 'student@example.com',
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
      expect(json.message).toContain('not a member of this project');
    });

    test('403: user with Student role is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({
        isAuthenticated: true,
        user: {
          cognitoSub: 'student-sub',
          userId: 2,
          email: 'student@example.com',
          isAdmin: false,
        },
      });

      // Mock: user has Student role
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              executeTakeFirst: jest.fn().mockReturnValue({ role: 'Student' } as any),
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

    test('400: invalid status value', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
          status: 'unknown',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('status must be one of');
    });

    test('400: empty string receipt_url', async () => {
      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 1000,
          receipt_url: '',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('receipt_url');
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
      expect(json.body.status).toBe('pending'); // default status
      expect(json.body.receiptUrl).toBeNull();
    });

    test('201: accepts explicit status and receipt_url', async () => {
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

      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(undefined as any),
        }),
      });

      const res = await handler(
        postEvent({
          projectID: 1,
          amount: 800,
          status: 'approved',
          receipt_url: 'https://s3.amazonaws.com/branch-receipts/receipt.pdf',
        })
      );

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.body.status).toBe('approved');
      expect(json.body.receiptUrl).toBe('https://s3.amazonaws.com/branch-receipts/receipt.pdf');
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

  describe('GET /expenditures unit tests', () => {
    test('401: unauthenticated GET is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
    });

    test('200: returns data array without pagination when no params', async () => {
      mockDb.selectFrom.mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            execute: jest.fn().mockReturnValue(fakeExpenditures as any),
          }),
        }),
      });

      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.pagination).toBeUndefined();
    });

    test('200: returns paginated response with page and limit', async () => {
      // count query
      mockDb.selectFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue({ count: '3' } as any),
        }),
      });
      // data query
      mockDb.selectFrom.mockReturnValueOnce({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockReturnValue({
                execute: jest.fn().mockReturnValue([fakeExpenditures[0]] as any),
              }),
            }),
          }),
        }),
      });

      const res = await handler(getEvent({ page: '1', limit: '1' }));
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.pagination).toBeDefined();
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(1);
      expect(json.pagination.totalItems).toBe(3);
      expect(json.pagination.totalPages).toBe(3);
    });

    test('400: page=0 returns 400', async () => {
      const res = await handler(getEvent({ page: '0', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: non-integer page returns 400', async () => {
      const res = await handler(getEvent({ page: 'abc', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: limit=0 returns 400', async () => {
      const res = await handler(getEvent({ page: '1', limit: '0' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: decimal limit returns 400', async () => {
      const res = await handler(getEvent({ page: '1', limit: '2.5' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: invalid projectId returns 400', async () => {
      const res = await handler(getEvent({ projectId: '-5' }));
      expect(res.statusCode).toBe(400);
    });
  });
});


describe('GET /expenditures/{id} unit tests', () => {
  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  describe('Validation', () => {
    test('400: non-numeric id', async () => {
      const res = await handler(idEvent('GET', 'abc'));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('positive integer');
    });

    test('400: negative id', async () => {
      const res = await handler(idEvent('GET', '-5'));
      expect(res.statusCode).toBe(400);
    });

    test('400: decimal id', async () => {
      const res = await handler(idEvent('GET', '5.5'));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Not found', () => {
    test('404: expenditure does not exist', async () => {
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(null));
      const res = await handler(idEvent('GET', '999'));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Expenditure not found');
    });
  });

  describe('Authorization', () => {
    // Membership is a property of the subject now, not a second query the
    // controller makes -- dispatch loads it once and the policy reads it.
    test('403: non-admin with no project membership cannot read', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));

      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe(
        'You can only view expenses on your own projects',
      );
    });

    test('200: non-admin with membership on the project can read', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Student' });
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));

      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(200);
    });

    // The author keeps access to what they filed even after leaving the project.
    test('200: the submitter can read their own expenditure off their projects', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockDb.selectFrom.mockReturnValue(
        mockSelectExpenditure({ ...fakeExpenditure, entered_by: studentAuthContext.user.userId }),
      );

      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Success cases', () => {
    test('200: admin can read any expenditure', async () => {
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));
      const res = await handler(idEvent('GET', '5'));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.ok).toBe(true);
      expect(json.route).toBe('GET /expenditures/{id}');
      expect(json.body.expenditureId).toBe(5);
      expect(json.body.projectId).toBe(1);
      expect(json.body.amount).toBe('1200');
    });

    test('response has correct HTTP headers', async () => {
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));
      const res = await handler(idEvent('GET', '5'));

      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers?.['Access-Control-Allow-Methods']).toContain('GET');
    });
  });
});


describe('DELETE /expenditures/{id} unit tests', () => {
  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  describe('Validation', () => {
    test('400: non-numeric id', async () => {
      const res = await handler(idEvent('DELETE', 'abc'));
      expect(res.statusCode).toBe(400);
    });

    test('400: negative id', async () => {
      const res = await handler(idEvent('DELETE', '-1'));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Not found', () => {
    test('404: expenditure does not exist (checked before authorization)', async () => {
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(null));
      const res = await handler(idEvent('DELETE', '999'));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Expenditure not found');
      // deleteFrom should never be reached if the expenditure lookup fails
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    test('404: row already gone by the time delete executes (race condition)', async () => {
      mockDb.selectFrom.mockReturnValueOnce(mockSelectExpenditure(fakeExpenditure));
      mockDb.deleteFrom.mockReturnValue(mockDelete(0n));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(404);
    });
  });

  // Deleting an expenditure is the author's right, not a project role's.
  // Membership only controls whether the row is visible at all -- someone who
  // cannot see it gets 404 rather than a 403 confirming it exists.
  describe('Authorization', () => {
    test('404: non-admin with no membership on the project cannot even see it', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(404);
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    test('403: a member of the project who did not submit it is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Student' });
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('You can only delete expenses you submitted');
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    // Directing the project is not enough either -- that rule went away with
    // the RBAC matrix.
    test('403: a Director on the project who did not submit it is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue(directorAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Director' });
      mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(fakeExpenditure));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(403);
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    test('403: the submitter cannot delete once it has been approved', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Student' });
      mockDb.selectFrom.mockReturnValue(
        mockSelectExpenditure({ ...fakeExpenditure, entered_by: 2, status: 'approved' }),
      );

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Approved expenses/);
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });
  });

  describe('the receipt goes with the row', () => {
    const withReceipt = {
      ...fakeExpenditure,
      receipt_url: 'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/flight.pdf',
    };

    beforeEach(() => {
    mockMemberships.length = 0;
      process.env.REPORTS_BUCKET_NAME = 'bucket';
      mockDb.selectFrom.mockReturnValueOnce(mockSelectExpenditure(withReceipt));
      mockDb.deleteFrom.mockReturnValue(mockDelete(1n));
      mockS3Send.mockResolvedValue({});
    });

    test('deletes the receipt object', async () => {
      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).receiptDeleted).toBe(true);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          __type: 'DeleteObject',
          Bucket: 'bucket',
          Key: 'receipts/1/flight.pdf',
        }),
      );
    });

    test('a failing S3 delete still deletes the row', async () => {
      // An orphaned object is recoverable; a row that cannot be deleted is not.
      mockS3Send.mockRejectedValue(new Error('AccessDenied'));

      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).receiptDeleted).toBe(false);
    });
  });

  test('an expenditure with no receipt makes no S3 call', async () => {
    process.env.REPORTS_BUCKET_NAME = 'bucket';
    mockDb.selectFrom.mockReturnValueOnce(mockSelectExpenditure(fakeExpenditure));
    mockDb.deleteFrom.mockReturnValue(mockDelete(1n));

    const res = await handler(idEvent('DELETE', '5'));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).receiptDeleted).toBe(true);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  describe('Success cases', () => {
    test('200: admin can delete without a membership lookup', async () => {
      mockDb.selectFrom.mockReturnValueOnce(mockSelectExpenditure(fakeExpenditure));
      mockDb.deleteFrom.mockReturnValue(mockDelete(1n));

      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.ok).toBe(true);
      expect(json.route).toBe('DELETE /expenditures/{id}');
      expect(json.pathParams).toEqual({ id: '5' });
    });

    test('200: the submitter can delete their own pending expenditure', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Student' });
      mockDb.selectFrom.mockReturnValue(
        mockSelectExpenditure({ ...fakeExpenditure, entered_by: 2 }),
      );
      mockDb.deleteFrom.mockReturnValue(mockDelete(1n));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(200);
    });

    // The author keeps the right to withdraw what they filed even if they are
    // no longer on the project.
    test('200: the submitter can delete after leaving the project', async () => {
      mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
      mockDb.selectFrom.mockReturnValue(
        mockSelectExpenditure({ ...fakeExpenditure, entered_by: 2 }),
      );
      mockDb.deleteFrom.mockReturnValue(mockDelete(1n));

      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(200);
    });
  });
});


describe('PATCH /expenditures/{id}/status unit tests', () => {
  function patchStatusEvent(id: string | number, body: unknown) {
    return {
      rawPath: `/expenditures/${id}/status`,
      requestContext: { http: { method: 'PATCH' } },
      headers: { Authorization: 'Bearer fake-token' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  }

  // Sets up selectFrom (existing + updated lookups) and updateTable chains.
  function mockExpenditureForPatch(existing: Record<string, unknown> | null, updated?: Record<string, unknown>) {
    mockDb.selectFrom.mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any)
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce(updated ?? existing),
        }),
      }),
    });

    mockDb.updateTable.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          execute: (jest.fn() as any).mockResolvedValue(undefined),
        }),
      }),
    });
  }

  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  test('200: admin approves an expenditure', async () => {
    mockExpenditureForPatch(
      { expenditure_id: 5, status: 'pending' },
      { expenditure_id: 5, status: 'approved' },
    );

    const res = await handler(patchStatusEvent(5, { status: 'approved' }));

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);
    expect(json.pathParams).toEqual({ id: '5' });
    expect(json.body.status).toBe('approved');
  });

  test('200: admin declines an expenditure', async () => {
    mockExpenditureForPatch(
      { expenditure_id: 5, status: 'pending' },
      { expenditure_id: 5, status: 'denied' },
    );

    const res = await handler(patchStatusEvent(5, { status: 'denied' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).body.status).toBe('denied');
  });

  test('401: unauthenticated request', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });

    const res = await handler(patchStatusEvent(5, { status: 'approved' }));

    expect(res.statusCode).toBe(401);
  });

  test('403: authenticated non-admin is rejected', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      user: { cognitoSub: 'student-sub', userId: 2, email: 'student@example.com', isAdmin: false },
    });

    const res = await handler(patchStatusEvent(5, { status: 'approved' }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('administrators');
  });

  test('400: invalid id', async () => {
    const res = await handler(patchStatusEvent('abc', { status: 'approved' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('id');
  });

  test('400: missing status', async () => {
    const res = await handler(patchStatusEvent(5, {}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('status is required');
  });

  test('400: status not valid', async () => {
    const res = await handler(patchStatusEvent(5, { status: 'pend' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('status must be one of');
  });

  test('404: expenditure not found', async () => {
    mockExpenditureForPatch(null);

    const res = await handler(patchStatusEvent(999, { status: 'approved' }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toContain('not found');
  });

  test('200: admin notes are persisted alongside the status', async () => {
    const setSpy: any = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ execute: (jest.fn() as any).mockResolvedValue(undefined) }),
    });
    mockDb.selectFrom.mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any)
            .mockResolvedValueOnce({ expenditure_id: 5, status: 'pending' })
            .mockResolvedValueOnce({
              expenditure_id: 5,
              status: 'needs_more_info',
              admin_notes: 'Need the itemised receipt',
            }),
        }),
      }),
    });
    mockDb.updateTable.mockReturnValue({ set: setSpy });

    const res = await handler(
      patchStatusEvent(5, { status: 'needs_more_info', adminNotes: 'Need the itemised receipt' }),
    );

    expect(res.statusCode).toBe(200);
    expect(setSpy).toHaveBeenCalledWith({
      status: 'needs_more_info',
      admin_notes: 'Need the itemised receipt',
    });
    expect(JSON.parse(res.body).body.adminNotes).toBe('Need the itemised receipt');
  });

  test('400: adminNotes present but blank', async () => {
    const res = await handler(patchStatusEvent(5, { status: 'approved', adminNotes: '   ' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('adminNotes');
  });
});

describe('GET /expenditures/upload-url unit tests', () => {
  function uploadUrlEvent(queryStringParameters: Record<string, string>) {
    return {
      rawPath: '/expenditures/upload-url',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters,
    };
  }

  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  test('200: admin gets a presigned PUT and the object URL', async () => {
    const res = await handler(uploadUrlEvent({ fileName: 'receipt.pdf', projectId: '1' }));

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.uploadUrl).toBe('https://signed.example/url');
    expect(json.objectUrl).toContain('/receipts/1/');
    expect(json.objectUrl).toContain('receipt.pdf');
  });

  test('route precedence: /expenditures/upload-url reaches the upload-url controller, not /expenditures/:id', async () => {
    // If route order regressed, this would hit the :id controller with id="upload-url"
    // and 400 on the digit check instead of presigning.
    const res = await handler(uploadUrlEvent({ fileName: 'receipt.pdf', projectId: '1' }));

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toHaveProperty('uploadUrl');
    expect(json).toHaveProperty('objectUrl');
    expect(json).not.toHaveProperty('route');
    expect(mockDb.selectFrom).not.toHaveBeenCalledWith('branch.expenditures');
  });

  test('400: non-PDF is rejected', async () => {
    const res = await handler(uploadUrlEvent({ fileName: 'receipt.png', projectId: '1' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('PDF');
  });

  test('400: missing fileName', async () => {
    const res = await handler(uploadUrlEvent({ projectId: '1' }));
    expect(res.statusCode).toBe(400);
  });

  test('400: invalid projectId', async () => {
    const res = await handler(uploadUrlEvent({ fileName: 'receipt.pdf', projectId: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  test('401: unauthenticated request', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);

    const res = await handler(uploadUrlEvent({ fileName: 'receipt.pdf', projectId: '1' }));
    expect(res.statusCode).toBe(401);
  });

  test('403: non-admin without a qualifying role on the project', async () => {
    mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
    mockDb.selectFrom.mockReturnValue(mockMembership({ role: 'Student' }));

    const res = await handler(uploadUrlEvent({ fileName: 'receipt.pdf', projectId: '1' }));

    expect(res.statusCode).toBe(403);
  });
});

describe('GET /expenditures/{id}/receipt unit tests', () => {
  function receiptEvent(id: string | number) {
    return {
      rawPath: `/expenditures/${id}/receipt`,
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
    };
  }

  beforeEach(() => {
    mockMemberships.length = 0;
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  test('200: returns a presigned download URL for a stored receipt', async () => {
    mockDb.selectFrom.mockReturnValue(
      mockSelectExpenditure({
        ...fakeExpenditure,
        receipt_url: 'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/12345-receipt.pdf',
      }),
    );

    const res = await handler(receiptEvent(5));

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBe('https://signed.example/url');
    expect(json.fileName).toBe('12345-receipt.pdf');
  });

  test('404: expenditure has no receipt', async () => {
    mockDb.selectFrom.mockReturnValue(
      mockSelectExpenditure({ ...fakeExpenditure, receipt_url: null }),
    );

    const res = await handler(receiptEvent(5));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toContain('no receipt');
  });

  test('404: expenditure does not exist', async () => {
    mockDb.selectFrom.mockReturnValue(mockSelectExpenditure(null));

    const res = await handler(receiptEvent(999));
    expect(res.statusCode).toBe(404);
  });

  test('403: non-admin with no membership on the project', async () => {
    mockAuthenticateRequest.mockResolvedValue(studentAuthContext);
    mockDb.selectFrom
      .mockReturnValueOnce(mockSelectExpenditure(fakeExpenditure))
      .mockReturnValueOnce(mockMembership(null));

    const res = await handler(receiptEvent(5));

    expect(res.statusCode).toBe(403);
  });

  test('401: unauthenticated request', async () => {
    mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false } as any);

    const res = await handler(receiptEvent(5));
    expect(res.statusCode).toBe(401);
  });
});