import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');
jest.mock('../report-service', () => ({
  checkProjectAccess: jest.fn(),
  fetchReportData: jest.fn(),
  generatePdf: jest.fn(),
  generateDocx: jest.fn(),
  uploadToS3: jest.fn(),
  saveReportRecord: jest.fn(),
}));

import { handler } from '../handler';
import db from '../db';
import { authenticateRequest } from '../auth';
import * as reportService from '../report-service';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockReportService = reportService as jest.Mocked<typeof reportService>;

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

const adminAuthContext = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'admin-sub',
    userId: 1,
    email: 'ashley@branch.org',
    isAdmin: true,
  },
};

const fakeReports = [
  { report_id: 3, project_id: 2, object_url: 'https://s3.amazonaws.com/reports/c.pdf', date_created: new Date('2025-07-01') },
  { report_id: 2, project_id: 1, object_url: 'https://s3.amazonaws.com/reports/b.pdf', date_created: new Date('2025-04-01') },
  { report_id: 1, project_id: 1, object_url: 'https://s3.amazonaws.com/reports/a.pdf', date_created: new Date('2025-01-01') },
];

function postEvent(body: Record<string, unknown>) {
  return {
    rawPath: '/',
    requestContext: { http: { method: 'POST' } },
    headers: { Authorization: 'Bearer fake-token' },
    body: JSON.stringify(body),
  };
}

describe('POST /reports unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    mockReportService.fetchReportData.mockResolvedValue({
      project: { project_id: 1, name: 'Test', description: 'Desc', total_budget: null, start_date: null, end_date: null, currency: null },
      members: [],
      donations: [],
      expenditures: [],
    } as any);
    mockReportService.checkProjectAccess.mockResolvedValue(true);
    mockReportService.generatePdf.mockResolvedValue(Buffer.from('pdf') as any);
    mockReportService.generateDocx.mockResolvedValue(Buffer.from('docx') as any);
    mockReportService.uploadToS3.mockResolvedValue('https://s3.example.com/reports/1/ts.pdf');
    mockReportService.saveReportRecord.mockResolvedValue({ report_id: 1, report_type: 'technical',object_url: 'https://s3.example.com/reports/1/ts.pdf' });
  });

  test('400: missing project_id returns 400', async () => {
    const res = await handler(postEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('project_id');
  });

  test('400: non-integer project_id returns 400', async () => {
    const res = await handler(postEvent({ project_id: 'abc' }));
    expect(res.statusCode).toBe(400);
  });

  test('400: invalid file_type returns 400', async () => {
    const res = await handler(postEvent({ project_id: 1, file_type: 'xlsx' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('file_type');
  });

  test('201: defaults to pdf when file_type is omitted', async () => {
    const res = await handler(postEvent({ project_id: 1 }));
    expect(res.statusCode).toBe(201);
    expect(mockReportService.generatePdf).toHaveBeenCalledTimes(1);
    expect(mockReportService.generateDocx).not.toHaveBeenCalled();
    expect(mockReportService.uploadToS3).toHaveBeenCalledWith(expect.any(Buffer), 1, 'pdf');
  });

  test('201: file_type=pdf calls generatePdf', async () => {
    const res = await handler(postEvent({ project_id: 1, file_type: 'pdf' }));
    expect(res.statusCode).toBe(201);
    expect(mockReportService.generatePdf).toHaveBeenCalledTimes(1);
    expect(mockReportService.generateDocx).not.toHaveBeenCalled();
    expect(mockReportService.uploadToS3).toHaveBeenCalledWith(expect.any(Buffer), 1, 'pdf');
  });

  test('201: file_type=docx calls generateDocx', async () => {
    const res = await handler(postEvent({ project_id: 1, file_type: 'docx' }));
    expect(res.statusCode).toBe(201);
    expect(mockReportService.generateDocx).toHaveBeenCalledTimes(1);
    expect(mockReportService.generatePdf).not.toHaveBeenCalled();
    expect(mockReportService.uploadToS3).toHaveBeenCalledWith(expect.any(Buffer), 1, 'docx');
  });

  test('404: project not found returns 404', async () => {
    mockReportService.fetchReportData.mockResolvedValue(null);
    const res = await handler(postEvent({ project_id: 999 }));
    expect(res.statusCode).toBe(404);
  });

  test('403: no project access returns 403', async () => {
    mockReportService.checkProjectAccess.mockResolvedValue(false);
    const res = await handler(postEvent({ project_id: 1 }));
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /reports unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    // db.fn is used by pagination count queries
    mockDb.fn = {
      count: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
    };
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(getEvent());
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
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
      expect(JSON.parse(res.body).ok).toBe(true);
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
