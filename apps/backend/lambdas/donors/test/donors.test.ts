import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { handler } from '../handler';
jest.mock('../auth');
import { authenticateRequest } from '../auth';
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'branch_dev',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_NAME ?? 'branch_db',
  ssl: false,
});

const seedSqlPath = path.resolve(__dirname, '../../../db/db_setup.sql');
const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

const authenticatedUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'staff-sub',
    userId: 1,
    email: 'person@branch.org',
    isAdmin: false,
  },
}

const adminUser = {
  isAuthenticated: true,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
}

function createEvent(method: string, path: string, body?: any, queryStringParameters?: Record<string, string>) {
  return {
    rawPath: path,
    requestContext: {
      http: {
        method: method,
      },
    },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: queryStringParameters ?? {},
  };
}

describe("Donor API with data", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  });

  test("health test 🌞", async () => {
    let res = await fetch("http://localhost:3000/donors/health");
    expect(res.status).toBe(200);
  });

  test("Status check for get all donors when donors exist 🌞 - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Status check for get all donors when donors exist 🌞 - with admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Content check for get all donors when donors exist 🌞 - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });

  test("401 when missing authorization header", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(401);
  });

  // --- Donors pagination ---

  test("GET /donors with page and limit returns paginated response", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(3);
    expect(body.data[0].organization).toBe('NIH');
  });

  test("GET /donors page=2 limit=1 returns second donor", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '2', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(1);
    expect(body.pagination.page).toBe(2);
    expect(body.data[0].organization).toBe('Harvard Medical');
  });

  test("GET /donors with limit larger than total returns all donors", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '100' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(3);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(1);
  });

  test("GET /donors with only page returns all donors without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donors with only limit returns all donors without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donors returns 400 for page=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '0', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for negative page", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '-1', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for non-integer page", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: 'abc', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for limit=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: '0' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donors returns 400 for non-integer limit", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/', undefined, { page: '1', limit: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  // --- Donations endpoint ---

  test("GET /donations returns 200 with data array", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });

  test("GET /donations with page and limit returns paginated response", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.totalItems).toBe(3);
    expect(body.pagination.totalPages).toBe(3);
  });

  test("GET /donations with only page returns all without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations with only limit returns all without pagination", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { limit: '2' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.pagination).toBeUndefined();
    expect(body.data.length).toBe(3);
  });

  test("GET /donations returns 400 for page=0", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '0', limit: '10' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 400 for non-integer limit", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '1.5' }));
    expect(res.statusCode).toBe(400);
  });

  test("GET /donations returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/donations'));
    expect(res.statusCode).toBe(401);
  });
  test("POST /donations returns 201 and created donation", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', {
      donor_id: 1, project_id: 4, amount: 500,
    }));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(body.data.donor_id).toBe(1);
    expect(body.data.project_id).toBe(4);
    expect(Number(body.data.amount)).toBe(500);
  });

  test("POST /donations returns 400 when donor_id is missing", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { project_id: 1, amount: 100 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is zero", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: 0 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 400 when amount is negative", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: -50 }));
    expect(res.statusCode).toBe(400);
  });

  test("POST /donations returns 401 when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('POST', '/donations', { donor_id: 1, project_id: 1, amount: 100 }));
    expect(res.statusCode).toBe(401);
  });
});

describe("Donor API when DB is empty", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE TABLE branch.donors RESTART IDENTITY CASCADE;');
    } finally {
      client.release();
    }
  });

  test("Status check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Status check for get all donors when DB is empty - with admin", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(200);
  });

  test("Content check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(createEvent('GET', '/'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  test("401 when missing authentication", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(401);
  });

  test("GET /donations returns empty data when DB is empty", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  test("GET /donations paginated returns 0 totalItems when DB is empty", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/donations', undefined, { page: '1', limit: '10' }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.length).toBe(0);
    expect(body.pagination.totalItems).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });
});

afterAll(async () => {
  await pool.end();
});
