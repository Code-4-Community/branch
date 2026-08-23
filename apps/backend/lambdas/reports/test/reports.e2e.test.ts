import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ensureSchema, resetData } from '../../../db/testkit';

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. Only the authenticate half
  // is faked: the subject is still loaded from the seeded memberships, which is
  // what makes "director" and "member of this project" mean anything here.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { loadRbacSubject } = jest.requireActual<typeof import('@branch/lambda-auth')>(
    '@branch/lambda-auth',
  );
  const db = jest.requireActual<typeof import('../db')>('../db').default;
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(
      authenticateRequest as never,
      (context) => loadRbacSubject(db as never, context),
    ),
  };
});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnValue({} as any),
  })),
  PutObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockReturnValue('https://presigned.example.com/upload' as any),
}));

import { handler } from '../handler';
import { authenticateRequest } from '../auth';

const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;

// objectUrlFor/keyFromObjectUrl require a bucket name; 'bucket' matches fakeObjectUrl below
process.env.REPORTS_BUCKET_NAME = 'bucket';

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
  ssl: false,
});

// Build schema "branch" from db/migrations if it isn't already current. Cheap
// (one SELECT) unless a migration was added since the schema was last built.
beforeAll(async () => {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
  } finally {
    client.release();
  }
});


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
      await resetData(client);
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

  describe('GET /reports/upload-url', () => {
    function uploadUrlEvent(queryStringParameters?: Record<string, string>) {
      return {
        rawPath: '/reports/upload-url',
        requestContext: { http: { method: 'GET' } },
        headers: { Authorization: 'Bearer fake-token' },
        queryStringParameters: queryStringParameters ?? {},
      };
    }

    test('200: returns uploadUrl and objectUrl for pdf', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'report.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.uploadUrl).toBe('https://presigned.example.com/upload');
      expect(body.objectUrl).toContain('report.pdf');
      expect(body.objectUrl).toContain('reports/1/');
    });

    test('200: returns uploadUrl and objectUrl for docx', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'doc.docx', projectId: '2' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.objectUrl).toContain('doc.docx');
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(401);
    });

    test('404: non-existent projectId returns 404', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '99999' }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('400: missing fileName returns 400', async () => {
      const res = await handler(uploadUrlEvent({ projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('fileName is required');
    });

    test('400: unsupported file extension returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.jpg', projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Only PDF and DOCX files are supported');
    });

    test('400: missing projectId returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });
  });

  describe('POST /reports', () => {
    const fakeObjectUrl = 'https://bucket.s3.us-east-2.amazonaws.com/reports/1/123-report.pdf';

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
      const res = await handler(postEvent({ title: 'New Report', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.report_id).toBeDefined();
      expect(body.title).toBe('New Report');
      expect(body.project_id).toBe(1);
      expect(body.object_url).toBe(fakeObjectUrl);
    });

    test('201: created report appears in subsequent GET /reports', async () => {
      const project2ObjectUrl = 'https://bucket.s3.us-east-2.amazonaws.com/reports/2/123-report.pdf';
      await handler(postEvent({ title: 'Verify Report', projectId: 2, objectUrl: project2ObjectUrl }));
      const getRes = await handler(getEvent());
      const getBody = JSON.parse(getRes.body);
      expect(getBody.data.some((r: any) => r.title === 'Verify Report')).toBe(true);
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(postEvent({ title: 'T', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(401);
    });

    test('404: non-existent projectId returns 404', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 99999, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('400: missing title returns 400', async () => {
      const res = await handler(postEvent({ projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('title is required');
    });

    test('400: empty title returns 400', async () => {
      const res = await handler(postEvent({ title: '   ', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('title is required');
    });

    test('400: missing projectId returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: missing objectUrl returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 1 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('objectUrl is required');
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

  describe('GET /reports/{id}', () => {
    function idEvent(method: 'GET' | 'DELETE', id: string | number) {
      return {
        rawPath: `/reports/${id}`,
        requestContext: { http: { method } },
        headers: { Authorization: 'Bearer fake-token' },
      };
    }

    test('200: returns report by id', async () => {
      // seed report 1 belongs to project 1
      const res = await handler(idEvent('GET', 1));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.body.report_id).toBe(1);
      expect(body.body.project_id).toBe(1);
    });

    test('404: non-numeric id falls through to catch-all', async () => {
      const res = await handler(idEvent('GET', 'abc'));
      expect(res.statusCode).toBe(404);
    });

    test('404: unknown id returns 404', async () => {
      const res = await handler(idEvent('GET', 99999));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Report not found');
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('GET', 1));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /reports/{id}', () => {
    function idEvent(method: 'GET' | 'DELETE', id: string | number) {
      return {
        rawPath: `/reports/${id}`,
        requestContext: { http: { method } },
        headers: { Authorization: 'Bearer fake-token' },
      };
    }

    test('200: admin can delete a report, removed from db', async () => {
      const res = await handler(idEvent('DELETE', 4));
      expect(res.statusCode).toBe(200);

      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM branch.reports WHERE report_id = 4');
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    test('404: non-numeric id falls through to catch-all', async () => {
      const res = await handler(idEvent('DELETE', 'abc'));
      expect(res.statusCode).toBe(404);
    });

    test('404: unknown id returns 404', async () => {
      const res = await handler(idEvent('DELETE', 99999));
      expect(res.statusCode).toBe(404);
    });

    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('DELETE', 1));
      expect(res.statusCode).toBe(401);
    });

    test('404: deleting the same report twice returns 404 the second time', async () => {
      const first = await handler(idEvent('DELETE', 5));
      expect(first.statusCode).toBe(200);

      const second = await handler(idEvent('DELETE', 5));
      expect(second.statusCode).toBe(404);
    });

    test('deleting one report does not affect other rows', async () => {
      const client = await pool.connect();
      let totalBefore: number;
      try {
        const result = await client.query('SELECT COUNT(*)::int AS count FROM branch.reports');
        totalBefore = result.rows[0].count;
      } finally {
        client.release();
      }

      const res = await handler(idEvent('DELETE', 3));
      expect(res.statusCode).toBe(200);

      const client2 = await pool.connect();
      try {
        const result = await client2.query('SELECT COUNT(*)::int AS count FROM branch.reports');
        expect(result.rows[0].count).toBe(totalBefore - 1);
      } finally {
        client2.release();
      }
    });
  });
});
