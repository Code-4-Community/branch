import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
jest.mock('../auth');
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnValue({} as any),
  })),
  PutObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockReturnValue('https://presigned.example.com/upload' as any),
}));
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
import { checkProjectAccess } from '../report-service';
import * as reportService from '../report-service';

const mockDb = db as any;
const mockAuthenticateRequest = authenticateRequest as jest.MockedFunction<typeof authenticateRequest>;
const mockReportService = reportService as jest.Mocked<typeof reportService>;
const mockCheckProjectAccess = mockReportService.checkProjectAccess; 
                                                                           
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
    rawPath: '/reports/generate',
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
    mockReportService.saveReportRecord.mockResolvedValue({ report_id: 1, object_url: 'https://s3.example.com/reports/1/ts.pdf' });
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

describe('GET /reports/upload-url unit tests', () => {
  function uploadUrlEvent(queryStringParameters?: Record<string, string>) {
    return {
      rawPath: '/reports/upload-url',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: queryStringParameters ?? {},
    };
  }

  function setupProjectMock(project: Record<string, unknown> | undefined) {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(project as any),
        }),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    mockCheckProjectAccess.mockReturnValue(true as any);
    setupProjectMock({ project_id: 1 });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Validation', () => {
    test('400: missing fileName returns 400', async () => {
      const res = await handler(uploadUrlEvent({ projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('fileName is required');
    });

    test('400: unsupported file extension returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.txt', projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Only PDF and DOCX files are supported');
    });

    test('400: missing projectId returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: projectId=0 returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '0' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: non-integer projectId returns 400', async () => {
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: 'abc' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });
  });

  describe('Business logic', () => {
    test('404: project not found returns 404', async () => {
      setupProjectMock(undefined);
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '999' }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('403: user has no project access returns 403', async () => {
      mockCheckProjectAccess.mockReturnValue(false as any);
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('You do not have access to upload reports for this project');
    });

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
  });
});

describe('POST /reports unit tests', () => {
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

  function setupInsertMock(report: Record<string, unknown>) {
    mockDb.insertInto = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returningAll: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(report as any),
        }),
      }),
    });
  }

  function setupProjectMock(project: Record<string, unknown> | undefined) {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(project as any),
        }),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    mockCheckProjectAccess.mockReturnValue(true as any);
    setupProjectMock({ project_id: 1 });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(postEvent({ title: 'T', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Validation', () => {
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

    test('400: string projectId returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 'abc', objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: projectId=0 returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 0, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('projectId must be a positive integer');
    });

    test('400: missing objectUrl returns 400', async () => {
      const res = await handler(postEvent({ title: 'T', projectId: 1 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('objectUrl is required');
    });
  });

  describe('Business logic', () => {
    test('403: user has no project access returns 403', async () => {
      mockCheckProjectAccess.mockReturnValue(false as any);
      const res = await handler(postEvent({ title: 'T', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('You do not have access to upload reports for this project');
    });

    test('404: nonexistent project returns 404', async () => {
      setupProjectMock(undefined);
      const res = await handler(postEvent({ title: 'T', projectId: 999, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('201: creates report and returns created report', async () => {
      const fakeReport = { report_id: 10, project_id: 1, title: 'My Report', object_url: fakeObjectUrl, date_created: new Date('2025-01-01') };
      setupInsertMock(fakeReport);

      const res = await handler(postEvent({ title: 'My Report', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.report_id).toBe(10);
      expect(body.title).toBe('My Report');
      expect(body.project_id).toBe(1);
      expect(body.object_url).toBe(fakeObjectUrl);
    });

    test('201: title is trimmed before inserting', async () => {
      let capturedValues: Record<string, unknown> = {};
      mockDb.insertInto = jest.fn().mockReturnValue({
        values: jest.fn().mockImplementation((vals: any) => {
          capturedValues = vals;
          return {
            returningAll: jest.fn().mockReturnValue({
              executeTakeFirst: jest.fn().mockReturnValue({ report_id: 1, project_id: 1, title: vals.title, object_url: fakeObjectUrl, date_created: new Date() } as any),
            }),
          };
        }),
      });

      await handler(postEvent({ title: '  My Report  ', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(capturedValues.title).toBe('My Report');
    });
  });
});
