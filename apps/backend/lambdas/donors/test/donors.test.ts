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

function createEvent(method: string, path: string, body?: any) {
  return {
    rawPath: path,
    requestContext: {
      http: {
        method: method,
      },
    },
    body: body ? JSON.stringify(body) : undefined,
  };
}

function createAdminToken() {
  mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
  return 'admin-token';
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

  test("Content check for get all donors when donors exist 🌞 - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticatedUser);
    const res = await handler(createEvent('GET', '/'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);
  });

  test("401 when missing authorization header", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(createEvent('GET', '/'));
    expect(res.statusCode).toBe(401);
  });
});

describe("Donor API when DB is empty", () => {
  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE TABLE donors RESTART IDENTITY CASCADE;');
    } finally {
      client.release();
    }
  });

  test("Status check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(
      createEvent('GET', '/')
    );
    expect(res.statusCode).toBe(200);
  });

  test("Content check for get all donors when DB is empty - with auth", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(adminUser);
    const res = await handler(
      createEvent('GET', '/')
    );
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test("401 when missing authentication", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({ isAuthenticated: false });
    const res = await handler(
      createEvent('GET', '/')
    );

    expect(res.statusCode).toBe(401);
  });
});

afterAll(async () => {
  await pool.end();
});
