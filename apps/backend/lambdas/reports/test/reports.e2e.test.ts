import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

jest.mock('../auth');
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({} as never),
    })),
    PutObjectCommand: jest.fn(),
  };
});

import { handler } from '../handler';
import { authenticateRequest } from '../auth';

const mockAuth = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

const pool = new Pool({
  host: 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

const seedSqlPath = path.resolve(__dirname, '../../../db/db_setup.sql');
const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/reports',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

function getEvent(rawPath: string) {
  return {
    rawPath,
    requestContext: { http: { method: 'GET' } },
    headers: {},
  };
}

// Seed data users:
// user 1: Ashley (is_admin via seed, PI on project 1)
// user 2: Renee (is_admin via seed, Accountant on project 1)
// user 3: Nour (is_admin via seed, Staff on project 2)

const adminUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'admin-sub', userId: 1, email: 'ashley@branch.org', isAdmin: true },
};

const piUser = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'pi-sub', userId: 1, email: 'ashley@branch.org', isAdmin: false },
};

const staffOnProject2 = {
  isAuthenticated: true as const,
  user: { cognitoSub: 'staff-sub', userId: 3, email: 'nour@branch.org', isAdmin: false },
};

describe('Reports e2e tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(adminUser);

    // Set env so uploadToS3 doesn't throw for missing bucket
    process.env.REPORTS_BUCKET_NAME = 'test-bucket';

    const client = await pool.connect();
    try {
      await client.query(seedSql);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Health check', () => {
    test('200: health check returns ok', async () => {
      const res = await handler(getEvent('/reports/health'));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuth.mockResolvedValue({ isAuthenticated: false });

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Authorization', () => {
    test('201: PI on project can generate report', async () => {
      mockAuth.mockResolvedValue(piUser);

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);
    });

    test('403: user with no membership on project is rejected', async () => {
      mockAuth.mockResolvedValue(staffOnProject2);

      // User 3 is Staff on project 2 only, not project 1
      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(403);
    });

    test('201: member on project 2 can generate report for project 2', async () => {
      mockAuth.mockResolvedValue(staffOnProject2);

      const res = await handler(postEvent({ project_id: 2 }));
      expect(res.statusCode).toBe(201);
    });

    test('201: admin can generate report for any project', async () => {
      mockAuth.mockResolvedValue(adminUser);

      const res = await handler(postEvent({ project_id: 3 }));
      expect(res.statusCode).toBe(201);
    });
  });

  describe('Success cases', () => {
    test('201: generates report with correct response shape', async () => {
      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.report_id).toBeDefined();
      expect(typeof body.report_id).toBe('number');
      expect(body.object_url).toBeDefined();
      expect(typeof body.object_url).toBe('string');
    });

    test('report record is persisted in the database', async () => {
      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body);

      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM branch.reports WHERE report_id = $1',
          [body.report_id],
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].project_id).toBe(1);
        expect(result.rows[0].object_url).toBe(body.object_url);
      } finally {
        client.release();
      }
    });

    test('generating multiple reports is idempotent (each creates a new record)', async () => {
      const res1 = await handler(postEvent({ project_id: 1 }));
      const res2 = await handler(postEvent({ project_id: 1 }));
      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      const body1 = JSON.parse(res1.body);
      const body2 = JSON.parse(res2.body);
      expect(body1.report_id).not.toBe(body2.report_id);
    });
  });

  describe('Error cases', () => {
    test('404: project does not exist', async () => {
      const res = await handler(postEvent({ project_id: 999 }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('400: missing project_id', async () => {
      const res = await handler(postEvent({}));
      expect(res.statusCode).toBe(400);
    });

    test('400: invalid project_id type', async () => {
      const res = await handler(postEvent({ project_id: 'abc' }));
      expect(res.statusCode).toBe(400);
    });
  });
});
