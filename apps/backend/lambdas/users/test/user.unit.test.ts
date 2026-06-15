import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the database module BEFORE importing handler
jest.mock('../db');
jest.mock('../auth');

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest, checkAuthorization } from '../auth';
import { before } from 'node:test';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockCheckAuthorization = checkAuthorization as jest.MockedFunction<typeof checkAuthorization>;

mockCheckAuthorization.mockImplementation((authContext, requiredAccess, resourceUserId?) => {
  if (requiredAccess === 'PUBLIC') {
    return { allowed: true };
  }
  
  if (!authContext.isAuthenticated || !authContext.user) {
    return { allowed: false, reason: 'Authentication required' };
  }
  
  if (requiredAccess === 'ADMIN') {
    return { 
      allowed: authContext.user.isAdmin, 
      reason: authContext.user.isAdmin ? undefined : 'Admin access required' 
    };
  }
  
  if (requiredAccess === 'ADMIN_OR_SELF') {
    const allowed = authContext.user.isAdmin || authContext.user.userId === Number(resourceUserId);
    return { 
      allowed, 
      reason: allowed ? undefined : 'Admin access or resource ownership required' 
    };
  }
  
  return { allowed: false, reason: 'Unknown access level' };
});


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

  mockDb.selectFrom.mockReturnValue({
    where: jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
        executeTakeFirst: (jest.fn() as any).mockResolvedValue(updated ?? existing),
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
      mockDb.selectFrom.mockReturnValue({
        where: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({
            executeTakeFirst: (jest.fn() as any).mockResolvedValue(null),
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
        email: 'new@example.com',
        is_admin: true,
        profile_image: null,
      });

      const res = await handler(patchEvent(1, { email: 'new@example.com', isAdmin: true }));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json).toHaveProperty('ok');
      expect(json).toHaveProperty('route');
      expect(json).toHaveProperty('body');
      expect(json.body.email).toBe('new@example.com');
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
