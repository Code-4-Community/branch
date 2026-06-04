import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { handler } from '../handler';
import { authenticateRequest, checkAuthorization } from '../auth';


jest.mock('../auth');

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockCheckAuthorization = checkAuthorization as jest.MockedFunction<typeof checkAuthorization>;


mockCheckAuthorization.mockImplementation((authContext, requiredAccess, resourceUserId?) => {
  if (requiredAccess === 'PUBLIC') return { allowed: true };
  if (!authContext.isAuthenticated || !authContext.user) return { allowed: false, reason: 'Authentication required' };
  if (requiredAccess === 'ADMIN') return { allowed: authContext.user.isAdmin, reason: authContext.user.isAdmin ? undefined : 'Admin access required' };
  if (requiredAccess === 'ADMIN_OR_SELF') {
    const allowed = authContext.user.isAdmin || authContext.user.userId === Number(resourceUserId);
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

beforeEach(async () => {
  jest.clearAllMocks();
  try {
    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
});

afterAll(async () => {
  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 500));
});


function createEvent(options: {
  method: string;
  path: string;
  body?: any;
  queryStringParameters?: Record<string, string>;
}) {
  return {
    rawPath: options.path,
    path: options.path,
    requestContext: {
      http: {
        method: options.method,
      },
    },
    httpMethod: options.method,
    body: options.body ? JSON.stringify(options.body) : null,
    queryStringParameters: options.queryStringParameters || null,
    headers: {},
  };
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

function mockRegularUserAuth(userId: number = 2) {
  mockAuthenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    user: {
      cognitoSub: `user-${userId}`,
      userId,
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

test("health test 🌞", async () => {
  mockNoAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/health',
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
});

test("patch user test 🌞", async () => {
  mockAdminAuth();
  
  const getEvent = createEvent({
    method: 'GET',
    path: '/1',
  })

  const originalRes = await handler(getEvent);
  expect(originalRes.statusCode).toBe(200);
  const originalBody = JSON.parse(originalRes.body).body;

  try {
    const patchEvent = createEvent({
      method: 'PATCH',
      path: '/1',
      body: {
        name: "John Branch",
        email: "mrbranch@example.com",
        isAdmin: false
      },
    });
    
    const res = await handler(patchEvent);
    expect(res.statusCode).toBe(200);
    
    const body = JSON.parse(res.body).body;
    expect(body.email).toBe("mrbranch@example.com");
    expect(body.name).toBe("John Branch");
    expect(body.isAdmin).toBe(false);
  } finally {
    // Restore original
    const restoreEvent = createEvent({
      method: 'PATCH',
      path: '/1',
      body: {
        name: originalBody.name,
        email: originalBody.email,
        isAdmin: originalBody.isAdmin
      },
    });
    await handler(restoreEvent);
  }
});

test("patch user profile_image test 🌞", async () => {
  mockAdminAuth();

  const patchEvent = createEvent({
    method: 'PATCH',
    path: '/1',
    body: {
      name: "Ashley Duggan",
      email: "ashley@branch.org",
      isAdmin: true,
      profileImage: "https://s3.amazonaws.com/branch-avatars/ashley.png"
    },
  });

  const res = await handler(patchEvent);
  expect(res.statusCode).toBe(200);

  const body = JSON.parse(res.body).body;
  expect(body.profileImage).toBe("https://s3.amazonaws.com/branch-avatars/ashley.png");
});


test("patch user 404 test 🌞", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'PATCH',
    path: '/4',
    body: {
      name: "John Doe",
      email: "john.doe@example.com"
    },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(404);
});

test("get users test", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  console.log(body);
  expect(body.users).toBeDefined();
  expect(Array.isArray(body.users)).toBe(true);
  expect(body.users.length).toBe(3);

  const firstUser = body.users[0];
  expect(firstUser.email).toBe("ashley@branch.org");
  expect(firstUser.is_admin).toBe(true);
  expect(firstUser.name).toBe("Ashley Duggan");
  expect(firstUser.user_id).toBe(1);

  const secondUser = body.users[1];
  expect(secondUser.email).toBe("renee@branch.org");
  expect(secondUser.is_admin).toBe(true);
  expect(secondUser.name).toBe("Renee Reddy");
  expect(secondUser.user_id).toBe(2);

  const thirdUser = body.users[2];
  expect(thirdUser.email).toBe("nour@branch.org");
  expect(thirdUser.is_admin).toBe(true);
  expect(thirdUser.name).toBe("Nour Shoreibah");
  expect(thirdUser.user_id).toBe(3);
});


test("get users with correct pagnation", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
    queryStringParameters: { page: '1', limit: '1' },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  console.log(body);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBe(1);
  expect(body.pagination.limit).toBe(1);
  expect(body.pagination.totalUsers).toBe(3);
  expect(body.pagination.totalPages).toBe(3);

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(1);

  const firstUser = body.users[0];
  expect(firstUser.email).toBe("ashley@branch.org");
  expect(firstUser.is_admin).toBe(true);
  expect(firstUser.name).toBe("Ashley Duggan");
  expect(firstUser.user_id).toBe(1);
});


test("get users with only page", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
    queryStringParameters: { page: '1' },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  console.log(body);

  expect(body.pagination).toBeUndefined();

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});


test("get users with only limit", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
    queryStringParameters: { limit: '1' },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  console.log(body);

  expect(body.pagination).toBeUndefined();

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});

test("get users with limit above total user", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
    queryStringParameters: { page: '1', limit: '100' },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  console.log(body);
  expect(body.pagination).toBeDefined();
  expect(body.pagination.page).toBe(1);
  expect(body.pagination.limit).toBe(100);
  expect(body.pagination.totalUsers).toBe(3);
  expect(body.pagination.totalPages).toBe(1);

  expect(body.users).toBeDefined();
  expect(body.users.length).toBe(3);
});

// Wrong path
test("get users error", async () => {
  mockNoAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/user',
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(401);
});

// regular user can't see all users
test("regular user cannot view all users", async () => {
  mockRegularUserAuth();
  
  const event = createEvent({
    method: 'GET',
    path: '/users',
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(403);
});

test("POST user success case", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'POST',
    path: '/users',
    body: {
      name: "Jane Branch",
      email: "jane@branch.com",
      isAdmin: true
    },
  });

  const res = await handler(event);
  expect(res.statusCode).toBe(201);

  const body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
  expect(body.body.name).toBe("Jane Branch");
  expect(body.body.email).toBe("jane@branch.com");
  expect(body.body.isAdmin).toBe(true);
});

test("POST user 400 case when invalid email is sent", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'POST',
    path: '/users',
    body: {
      name: "Invalid User",
      email: "",
      isAdmin: false
    },
  });

  const res = await handler(event);
  expect(res.statusCode).toBe(400);
});

test("POST user 400 case when request sent with missing fields", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'POST',
    path: '/users',
    body: {
      name: "Invalid User",
    },
  });

  const res = await handler(event);
  expect(res.statusCode).toBe(400);
});

// regular user can't make new users

test("regular user cannot create users", async () => {
  mockRegularUserAuth();
  
  const event = createEvent({
    method: 'POST',
    path: '/users',
    body: { name: "Test", email: "test@example.com", isAdmin: false },
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(403);
});


test("delete user test 🌞", async () => {
  mockAdminAuth();
  
  const deleteEvent = createEvent({
    method: 'DELETE',
    path: '/1',
  });

  const res = await handler(deleteEvent);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
  expect(body.route).toBe("DELETE /users/{userId}");
  expect(body.pathParams.userId).toBe("1");

  // Verify user is deleted
  const getEvent = createEvent({
    method: 'GET',
    path: '/1',
  });
  const getRes = await handler(getEvent);
  expect(getRes.statusCode).toBe(404);
  
  const getBody = JSON.parse(getRes.body);
  expect(getBody.message).toBe('User not found');
});


test("delete user 404 test 🌞", async () => {
  mockAdminAuth();
  
  const event = createEvent({
    method: 'DELETE',
    path: '/9999',
  });

  const res = await handler(event);
  expect(res.statusCode).toBe(404);
  
  const body = JSON.parse(res.body);
  expect(body.message).toBe('User not found');
});


test("delete same user twice returns 404 on second attempt", async () => {
  mockAdminAuth();
  
  const event1 = createEvent({
    method: 'DELETE',
    path: '/1',
  });
  const res1 = await handler(event1);
  expect(res1.statusCode).toBe(200);

  const event2 = createEvent({
    method: 'DELETE',
    path: '/1',
  });
  const res2 = await handler(event2);
  expect(res2.statusCode).toBe(404);
  
  const body = JSON.parse(res2.body);
  expect(body.message).toBe('User not found');
});


test("delete multiple users", async () => {
  mockAdminAuth();
  
  const event1 = createEvent({
    method: 'DELETE',
    path: '/1',
  });
  const res1 = await handler(event1);
  expect(res1.statusCode).toBe(200);

  const event2 = createEvent({
    method: 'DELETE',
    path: '/2',
  });
  const res2 = await handler(event2);
  expect(res2.statusCode).toBe(200);

  // Check both are deleted
  const check1Event = createEvent({
    method: 'GET',
    path: '/1',
  });
  const check1 = await handler(check1Event);
  expect(check1.statusCode).toBe(404);

  const check2Event = createEvent({
    method: 'GET',
    path: '/2',
  });
  const check2 = await handler(check2Event);
  expect(check2.statusCode).toBe(404);
});


test("delete user 1 does not affect user 2", async () => {
  mockAdminAuth();
  
  // Delete user 1
  const deleteEvent = createEvent({
    method: 'DELETE',
    path: '/1',
  });
  await handler(deleteEvent);

  // User 2 should still exist
  const getEvent = createEvent({
    method: 'GET',
    path: '/2',
  });
  const res = await handler(getEvent);
  expect(res.statusCode).toBe(200);
  
  const body = JSON.parse(res.body);
  expect(body.body.email).toBe('renee@branch.org');
});

// regular user can't delete others

test("regular user cannot delete users", async () => {
  mockRegularUserAuth();
  
  const event = createEvent({
    method: 'DELETE',
    path: '/1',
  });
  
  const res = await handler(event);
  expect(res.statusCode).toBe(403);
});