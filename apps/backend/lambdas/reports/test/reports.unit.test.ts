import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');
jest.mock('../report-service', () => {
  const actual = jest.requireActual('../report-service') as any;
  return {
    ...actual,
    checkProjectAccess: jest.fn(),
    fetchReportData: jest.fn(),
    generatePdf: jest.fn(),
    uploadToS3: jest.fn(),
    saveReportRecord: jest.fn(),
  };
});

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';
import {
  checkProjectAccess,
  fetchReportData,
  generatePdf,
  uploadToS3,
  saveReportRecord,
} from '../report-service';

const mockDb = db as any;
const mockAuth = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockCheckAccess = checkProjectAccess as jest.MockedFunction<typeof checkProjectAccess>;
const mockFetchData = fetchReportData as jest.MockedFunction<typeof fetchReportData>;
const mockGeneratePdf = generatePdf as jest.MockedFunction<typeof generatePdf>;
const mockUploadToS3 = uploadToS3 as jest.MockedFunction<typeof uploadToS3>;
const mockSaveRecord = saveReportRecord as jest.MockedFunction<typeof saveReportRecord>;

function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/reports',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

function getEvent(queryStringParameters?: Record<string, string>) {
  return {
    rawPath: '/',
    requestContext: { http: { method: 'GET' } },
    headers: { Authorization: 'Bearer fake-token' },
    queryStringParameters: queryStringParameters ?? {},
  };
}

const adminAuthContext = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'admin@example.com',
    isAdmin: true,
  },
};

const memberAuthContext = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'member-sub',
    userId: 2,
    email: 'member@example.com',
    isAdmin: false,
  },
};

const sampleReportData = {
  project: {
    project_id: 1,
    name: 'Test Project',
    description: 'A test project',
    total_budget: '50000.00',
    start_date: new Date('2025-01-01'),
    end_date: new Date('2026-01-01'),
    currency: 'USD',
  },
  members: [{ name: 'Alice', email: 'alice@test.com', role: 'PI', hours: '100.00' }],
  donations: [{ organization: 'NIH', contact_name: 'Dr. Lee', amount: '25000.00', donated_at: new Date('2025-01-10') }],
  expenditures: [{ category: 'Travel', description: 'Conference', amount: '5000.00', spent_on: new Date('2025-02-10'), entered_by_name: 'Alice' }],
};

const fakeReports = [
  { report_id: 3, project_id: 2, object_url: 'https://s3.amazonaws.com/reports/c.pdf', date_created: new Date('2025-07-01') },
  { report_id: 2, project_id: 1, object_url: 'https://s3.amazonaws.com/reports/b.pdf', date_created: new Date('2025-04-01') },
  { report_id: 1, project_id: 1, object_url: 'https://s3.amazonaws.com/reports/a.pdf', date_created: new Date('2025-01-01') },
];

describe('POST /reports unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(adminAuthContext);
    mockCheckAccess.mockResolvedValue(true);
    mockFetchData.mockResolvedValue(sampleReportData);
    mockGeneratePdf.mockResolvedValue(Buffer.from('fake-pdf-content'));
    mockUploadToS3.mockResolvedValue('https://bucket.s3.amazonaws.com/reports/1/mock.pdf');
    mockSaveRecord.mockResolvedValue({ report_id: 42, object_url: 'https://bucket.s3.amazonaws.com/reports/1/mock.pdf' });
  });

  describe('Health check', () => {
    test('200: GET /health returns ok', async () => {
      const res = await handler({
        rawPath: '/health',
        requestContext: { http: { method: 'GET' } },
        headers: {},
        queryStringParameters: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuth.mockResolvedValue({ isAuthenticated: false });

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });

    test('401: authenticated but no user object', async () => {
      mockAuth.mockResolvedValue({ isAuthenticated: true });

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Authorization', () => {
    test('403: non-member, non-admin is rejected', async () => {
      mockAuth.mockResolvedValue(memberAuthContext);
      mockCheckAccess.mockResolvedValue(false);

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toContain('do not have access');
    });

    test('201: admin can generate report for any project', async () => {
      mockAuth.mockResolvedValue(adminAuthContext);
      mockCheckAccess.mockResolvedValue(true);

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);
      expect(mockCheckAccess).toHaveBeenCalledWith(1, 1, true);
    });

    test('201: project member can generate report', async () => {
      mockAuth.mockResolvedValue(memberAuthContext);
      mockCheckAccess.mockResolvedValue(true);

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);
      expect(mockCheckAccess).toHaveBeenCalledWith(2, 1, false);
    });
  });

  describe('Input validation', () => {
    test('400: missing project_id', async () => {
      const res = await handler(postEvent({}));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('project_id is required');
    });

    test('400: project_id is null', async () => {
      const res = await handler(postEvent({ project_id: null }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('project_id is required');
    });

    test('400: project_id is not a number', async () => {
      const res = await handler(postEvent({ project_id: 'abc' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('positive integer');
    });

    test('400: project_id is a float', async () => {
      const res = await handler(postEvent({ project_id: 1.5 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('positive integer');
    });

    test('400: project_id is zero', async () => {
      const res = await handler(postEvent({ project_id: 0 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('positive integer');
    });

    test('400: project_id is negative', async () => {
      const res = await handler(postEvent({ project_id: -1 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('positive integer');
    });
  });

  describe('Project not found', () => {
    test('404: project does not exist', async () => {
      mockFetchData.mockResolvedValue(null);

      const res = await handler(postEvent({ project_id: 999 }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });
  });

  describe('Success cases', () => {
    test('201: returns report_id and object_url', async () => {
      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.report_id).toBe(42);
      expect(body.object_url).toBe('https://bucket.s3.amazonaws.com/reports/1/mock.pdf');
    });

    test('calls service functions in correct order with correct args', async () => {
      await handler(postEvent({ project_id: 1 }));

      expect(mockCheckAccess).toHaveBeenCalledWith(1, 1, true);
      expect(mockFetchData).toHaveBeenCalledWith(1);
      expect(mockGeneratePdf).toHaveBeenCalledWith(sampleReportData);
      expect(mockUploadToS3).toHaveBeenCalledWith(Buffer.from('fake-pdf-content'), 1);
      expect(mockSaveRecord).toHaveBeenCalledWith(1, 'https://bucket.s3.amazonaws.com/reports/1/mock.pdf');
    });

    test('response has correct CORS headers', async () => {
      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers?.['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('Error handling', () => {
    test('500: PDF generation fails', async () => {
      mockGeneratePdf.mockRejectedValue(new Error('PDF error'));

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('Failed to generate report PDF');
    });

    test('500: S3 upload fails', async () => {
      mockUploadToS3.mockRejectedValue(new Error('S3 error'));

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('Failed to upload report');
    });

    test('500: save record fails (uncaught)', async () => {
      mockSaveRecord.mockRejectedValue(new Error('DB insert error'));

      const res = await handler(postEvent({ project_id: 1 }));
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).message).toBe('Internal Server Error');
    });
  });

  describe('Routing', () => {
    test('404: POST to unknown path returns not found', async () => {
      const res = await handler({
        rawPath: '/unknown',
        requestContext: { http: { method: 'POST' } },
        headers: {},
        body: JSON.stringify({ project_id: 1 }),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

describe('GET /reports unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(adminAuthContext);
    mockDb.fn = {
      count: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
    };
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuth.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Response format', () => {
    test('200: returns data array without pagination when no params', async () => {
      mockDb.selectFrom.mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            execute: jest.fn().mockReturnValue(fakeReports as any),
          }),
        }),
      });

      const res = await handler(getEvent());
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.pagination).toBeUndefined();
      expect(res.headers?.['Content-Type']).toBe('application/json');
      expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });

    test('404: unknown path returns 404', async () => {
      const res = await handler({
        rawPath: '/unknown',
        requestContext: { http: { method: 'GET' } },
        headers: {},
        queryStringParameters: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Pagination', () => {
    test('200: returns paginated response with page and limit', async () => {
      mockDb.selectFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue({ count: '3' } as any),
        }),
      });
      mockDb.selectFrom.mockReturnValueOnce({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockReturnValue({
                execute: jest.fn().mockReturnValue([fakeReports[0]] as any),
              }),
            }),
          }),
        }),
      });

      const res = await handler(getEvent({ page: '1', limit: '1' }));
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(1);
      expect(json.pagination.totalItems).toBe(3);
      expect(json.pagination.totalPages).toBe(3);
      expect(json.data.length).toBe(1);
    });

    test('200: only page provided returns all without pagination', async () => {
      mockDb.selectFrom.mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            execute: jest.fn().mockReturnValue(fakeReports as any),
          }),
        }),
      });

      const res = await handler(getEvent({ page: '1' }));
      const json = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(json.pagination).toBeUndefined();
    });

    test('200: only limit provided returns all without pagination', async () => {
      mockDb.selectFrom.mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            execute: jest.fn().mockReturnValue(fakeReports as any),
          }),
        }),
      });

      const res = await handler(getEvent({ limit: '2' }));
      const json = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(json.pagination).toBeUndefined();
    });
  });

  describe('Validation', () => {
    test('400: page=0 returns 400', async () => {
      const res = await handler(getEvent({ page: '0', limit: '10' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('page');
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
      expect(JSON.parse(res.body).message).toContain('limit');
    });

    test('400: decimal limit returns 400', async () => {
      const res = await handler(getEvent({ page: '1', limit: '1.5' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: invalid projectId returns 400', async () => {
      const res = await handler(getEvent({ projectId: 'abc' }));
      expect(res.statusCode).toBe(400);
    });

    test('400: projectId=0 returns 400', async () => {
      const res = await handler(getEvent({ projectId: '0' }));
      expect(res.statusCode).toBe(400);
    });
  });
});
