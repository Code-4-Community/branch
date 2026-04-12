import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

jest.mock('../auth');
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnValue({} as any),
  })),
  PutObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
}));

import { handler } from '../handler';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

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

function getEvent(queryStringParameters?: Record<string, string>) {
  return {
    rawPath: '/',
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: queryStringParameters ?? {},
  };
}

const adminUser = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
};

describe('Reports e2e tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminUser);

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
      const res = await handler({
        rawPath: '/health',
        requestContext: { http: { method: 'GET' } },
        headers: {},
        queryStringParameters: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /reports — list and pagination', () => {
    test('200: returns all reports with data envelope', async () => {
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(5); // seed has 5 reports
      expect(body.pagination).toBeUndefined();
    });

    test('200: ordered newest first by date_created', async () => {
      const res = await handler(getEvent());
      const body = JSON.parse(res.body);
      const dates = body.data.map((r: any) => new Date(r.date_created).getTime());
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
    });

    test('200: paginated with page=1 limit=2', async () => {
      const res = await handler(getEvent({ page: '1', limit: '2' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.totalItems).toBe(5);
      expect(body.pagination.totalPages).toBe(3);
    });

    test('200: page=2 limit=2 returns next slice', async () => {
      const res = await handler(getEvent({ page: '2', limit: '2' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.length).toBe(2);
      expect(body.pagination.page).toBe(2);
    });

    test('200: limit larger than total returns all', async () => {
      const res = await handler(getEvent({ page: '1', limit: '100' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.length).toBe(5);
      expect(body.pagination.totalPages).toBe(1);
    });

    test('200: only page provided returns all without pagination', async () => {
      const res = await handler(getEvent({ page: '1' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.pagination).toBeUndefined();
      expect(body.data.length).toBe(5);
    });

    test('200: only limit provided returns all without pagination', async () => {
      const res = await handler(getEvent({ limit: '3' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.pagination).toBeUndefined();
      expect(body.data.length).toBe(5);
    });

    test('200: filter by projectId returns only matching reports', async () => {
      const res = await handler(getEvent({ projectId: '1' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.every((r: any) => r.project_id === 1)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    test('200: projectId filter with pagination', async () => {
      // project 2 has 2 reports, project 3 has 2 reports in seed data
      const res = await handler(getEvent({ projectId: '2', page: '1', limit: '10' }));
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.every((r: any) => r.project_id === 2)).toBe(true);
      expect(body.pagination.totalItems).toBe(2);
    });

    test('400: page=0 returns 400', async () => {
      const res = await handler(getEvent({ page: '0', limit: '10' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: negative page returns 400', async () => {
      const res = await handler(getEvent({ page: '-1', limit: '10' }));
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
      const res = await handler(getEvent({ projectId: 'abc' }));
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /reports', () => {
    const validBase64 = Buffer.from('fake file content').toString('base64');

    function postEvent(body: unknown) {
      return {
        rawPath: '/reports',
        requestContext: { http: { method: 'POST' } },
        headers: { Authorization: 'Bearer fake-token' },
        queryStringParameters: {},
        body: JSON.stringify(body),
      };
    }

    test('201: creates a new report and persists to db', async () => {
      const res = await handler(postEvent({ title: 'New Report', projectId: 1, fileName: 'report.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.report_id).toBeDefined();
      expect(body.title).toBe('New Report');
      expect(body.project_id).toBe(1);
      expect(body.object_url).toContain('report.pdf');
    });

    test('201: created report appears in subsequent GET /reports', async () => {
      await handler(postEvent({ title: 'Verify Report', projectId: 2, fileName: 'verify.docx', fileContent: validBase64 }));
      const getRes = await handler(getEvent());
      const getBody = JSON.parse(getRes.body);
      expect(getBody.data.some((r: any) => r.title === 'Verify Report')).toBe(true);
    });

    test('201: creates report with docx file', async () => {
      const res = await handler(postEvent({ title: 'Docx Report', projectId: 2, fileName: 'doc.docx', fileContent: validBase64 }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.object_url).toContain('doc.docx');
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(postEvent({ title: 'T', projectId: 1, fileName: 'f.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(401);
    });

    test('404: non-existent projectId returns 404', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 99999, fileName: 'f.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('400: missing title returns 400', async () => {
      const res = await handler(postEvent({ projectId: 1, fileName: 'f.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('title is required');
    });

    test('400: empty title returns 400', async () => {
      const res = await handler(postEvent({ title: '   ', projectId: 1, fileName: 'f.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('title is required');
    });

    test('400: missing projectId returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', fileName: 'f.pdf', fileContent: validBase64 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: unsupported file extension returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 1, fileName: 'f.jpg', fileContent: validBase64 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Only PDF and DOCX files are supported');
    });

    test('400: missing fileContent returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 1, fileName: 'f.pdf' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('fileContent must be a base64 encoded string');
    });

    test('400: invalid JSON body returns 400', async () => {
      const res = await handler({
        rawPath: '/reports',
        requestContext: { http: { method: 'POST' } },
        headers: { Authorization: 'Bearer fake-token' },
        queryStringParameters: {},
        body: 'not json',
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Invalid JSON in request body');
    });
  });
});
