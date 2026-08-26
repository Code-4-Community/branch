import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { dispatch, json, type Route } from '@branch/lambda-http';

// Mock the database module BEFORE importing handler
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

// The DELETE route calls AdminDeleteUser; never let a test reach a real pool.
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const actual = jest.requireActual('@aws-sdk/client-cognito-identity-provider') as object;
  return {
    ...actual,
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';
import { before } from 'node:test';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;



// Helper function to create a POST event
function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/users',
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    body: JSON.stringify(body),
  };
}

// Helper to create a PATCH event for /{userId}
function patchEvent(userId: string | number, body: unknown) {
  return {
    rawPath: `/${userId}`,
    requestContext: {
      http: {
        method: 'PATCH',
      },
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function mockExistingUserForPatch(updated?: Record<string, unknown>) {
  const existing = {
    user_id: 1,
    name: 'Existing User',
    email: 'existing@example.com',
    is_admin: false,
    profile_image: null,
  };

  // patchUser writes and reads back in one statement, so the row the handler
  // answers with is the one the UPDATE's RETURNING produces.
  mockDb.updateTable.mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returningAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue(updated ?? existing),
        }),
      }),
    }),
  });
}

function mockAdminAuth() {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: {
      cognitoSub: 'admin-123',
      userId: 1,
      email: 'admin@example.com',
      isAdmin: true,
    },
  });
}

function mockRegularUserAuth() {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: {
      cognitoSub: 'user-123',
      userId: 2,
      email: 'user@example.com',
      isAdmin: false,
    },
  });
}

function mockNoAuth() {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: false,
  });
}

describe('POST /users unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    test('401: unauthenticated user cannot create users', async () => {
      mockNoAuth();

      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Authentication required');
    });

    test('403: regular user cannot create users', async () => {
      mockRegularUserAuth();

      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
    });

    test('401: unauthenticated user cannot view all users', async () => {
      mockNoAuth();
  
      const res = await handler({
        rawPath: '/users',
        requestContext: { http: { method: 'GET' } },
        body: null,
      });
  
      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.message).toBe('Authentication required');
    });

    test('401: unauthenticated user cannot view specific user', async () => {
      mockNoAuth();
  
      const res = await handler({
        rawPath: '/1',
        requestContext: { http: { method: 'GET' } },
        body: null,
      });
  
      expect(res.statusCode).toBe(401);
    });

    test('401: unauthenticated user cannot update users', async () => {
      mockNoAuth();
  
      const res = await handler({
        rawPath: '/1',
        requestContext: { http: { method: 'PATCH' } },
        body: JSON.stringify({ name: 'New Name' }),
      });
  
      expect(res.statusCode).toBe(401);
    });

    test('401: unauthenticated user cannot delete users', async () => {
      mockNoAuth();
  
      const res = await handler({
        rawPath: '/1',
        requestContext: { http: { method: 'DELETE' } },
        body: null,
      });
  
      expect(res.statusCode).toBe(401);
    });
  });


  describe('Input Validation', () => {
    beforeEach(() => {
      mockAdminAuth();
    })
    test('400: missing email field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: missing name field', async () => {
      const res = await handler(
        postEvent({
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: missing isAdmin field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('required');
    });

    test('400: isAdmin is not a boolean', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: 'yes',
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('isAdmin');
    });

    test('400: empty email field', async () => {
      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: '',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('required');
    });

    test('400: empty name field', async () => {
      const res = await handler(
        postEvent({
          name: '',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toContain('required');
    });

    test('400: name is not a string', async () => {
      const res = await handler(
        postEvent({
          name: 42,
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('name');
    });
  });

  describe('Response Format', () => {
  });

  describe('Success Cases', () => {
    beforeEach(() => {
      mockAdminAuth();
      (mockSend as any).mockResolvedValue({
        User: { Attributes: [{ Name: 'sub', Value: 'test-cognito-sub-123' }] },
      });
    });

    test('201: successful POST returns 201 status and correct response shape', async () => {
      // Setup mocks for successful user creation
      // Mock the email check to return null (user doesn't exist)
      const whereChain = {
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue(null),
        }),
      };
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue(whereChain),
      });

      // Mock the insert
      mockDb.insertInto.mockReturnValue({
        values: jest.fn().mockReturnValue({
          execute: (jest.fn() as any).mockResolvedValue(undefined),
        }),
      });

      const res = await handler(
        postEvent({
          name: 'John Doe',
          email: 'john@example.com',
          isAdmin: false,
        })
      );

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('ok');
      expect(json).toHaveProperty('route');
      expect(json).toHaveProperty('pathParams');
      expect(json).toHaveProperty('body');
    });

    test('409: POST returns 409 when user already exists', async () => {
      // Mock: user already exists
      const whereChain = {
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: (jest.fn() as any).mockResolvedValue({
            user_id: 1,
            name: 'Existing User',
            email: 'existing@example.com',
            is_admin: false,
            created_at: new Date(),
          }),
        }),
      };
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue(whereChain),
      });

      const res = await handler(
        postEvent({
          name: 'New User',
          email: 'existing@example.com',
          isAdmin: true,
        })
      );

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('message');
    });
  });
});

describe('PATCH /users/{userId} unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminAuth();
  });

  describe('Input Validation', () => {
    test('400: invalid email format', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { email: 'not-an-email' }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('email');
    });

    test('400: email is not a string', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { email: 123 }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('email');
    });

    test('400: name is not a string', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { name: 42 }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('name');
    });

    test('400: empty name field', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { name: '   ' }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('name');
    });

    test('400: isAdmin is not a boolean', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { isAdmin: 'yes' }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('isAdmin');
    });

    test('400: profileImage is not a string', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, { profileImage: 5 }));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('profileImage');
    });

    test('400: no valid fields provided', async () => {
      mockExistingUserForPatch();

      const res = await handler(patchEvent(1, {}));

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.message).toBeDefined();
      expect(json.message).toContain('No valid fields');
    });

  });

  describe('Success Cases', () => {
    test('404: returns 404 when user does not exist', async () => {
      // Nothing matched the id, so the UPDATE returns no row.
      mockDb.updateTable.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returningAll: jest.fn().mockReturnValue({
              executeTakeFirst: (jest.fn() as any).mockResolvedValue(undefined),
            }),
          }),
        }),
      });

      const res = await handler(patchEvent(999, { name: 'Whoever' }));

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('message');
    });

    test('200: valid partial update returns updated fields', async () => {
      mockExistingUserForPatch({
        user_id: 1,
        name: 'Existing User',
        email: 'existing@example.com',
        is_admin: true,
        profile_image: null,
      });

      const res = await handler(patchEvent(1, { isAdmin: true }));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('ok');
      expect(json).toHaveProperty('route');
      expect(json).toHaveProperty('body');
      expect(json.body.email).toBe('existing@example.com');
      expect(json.body.isAdmin).toBe(true);
    });

    test('200: only the provided field is written to the database', async () => {
      mockExistingUserForPatch({
        user_id: 1,
        name: 'New Name',
        email: 'existing@example.com',
        is_admin: false,
        profile_image: null,
      });

      const res = await handler(patchEvent(1, { name: 'New Name' }));

      expect(res.statusCode).toBe(200);
      // Only the provided field should be passed to .set(). toStrictEqual (unlike
      // toEqual) does NOT ignore undefined keys, so this fails if the handler ever
      // regresses to setting every column and leaving omitted ones undefined.
      const setCall = (mockDb.updateTable.mock.results[0].value.set as jest.Mock).mock.calls[0][0];
      expect(setCall).toStrictEqual({ name: 'New Name' });
    });
  });
});

describe('route precedence', () => {
  test('a literal segment route wins over a same-shaped :param route placed after it', async () => {
    const literalHandler = jest.fn(async () => json(200, { matched: 'literal' }));
    const paramHandler = jest.fn(async () => json(200, { matched: 'param' }));

    // `access: 'public'` keeps this about matching order: dispatch then skips
    // authentication entirely, so no session has to be faked to observe it.
    const routes: Route[] = [
      { method: 'GET', pattern: '/users/me', access: 'public', handler: literalHandler },
      { method: 'GET', pattern: '/users/:userId', access: 'public', handler: paramHandler },
    ];

    const literalRes = await dispatch(
      { rawPath: '/users/me', requestContext: { http: { method: 'GET' } } },
      { prefix: 'users', routes },
    );
    expect(JSON.parse(literalRes.body)).toEqual({ matched: 'literal' });
    expect(literalHandler).toHaveBeenCalledTimes(1);
    expect(paramHandler).not.toHaveBeenCalled();

    const paramRes = await dispatch(
      { rawPath: '/users/42', requestContext: { http: { method: 'GET' } } },
      { prefix: 'users', routes },
    );
    expect(JSON.parse(paramRes.body)).toEqual({ matched: 'param' });
    expect(paramHandler).toHaveBeenCalledTimes(1);
  });
});
