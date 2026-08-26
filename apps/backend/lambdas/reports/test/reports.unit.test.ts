import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../db');
// Memberships the mocked session should appear to have. Named `mock*` so it can
// be referenced from the jest.mock factory below.
const mockMemberships: Array<{ project_id: number; role: string }> = [];

jest.mock('../auth', () => {
  // dispatch() resolves the caller through resolveAuth, so an auto-mock would
  // hand it `undefined` and every route would 500. This suite mocks ../db, so
  // the subject is assembled from the auth context and `mockMemberships`
  // instead of being read from Postgres -- same buildSubject either way.
  const { createAuthResolver } = jest.requireActual<typeof import('@branch/lambda-http')>(
    '@branch/lambda-http',
  );
  const { buildSubject } = jest.requireActual<typeof import('@branch/rbac')>('@branch/rbac');
  const authenticateRequest = jest.fn();
  return {
    ...jest.requireActual<typeof import('../auth')>('../auth'),
    authenticateRequest,
    resolveAuth: createAuthResolver(authenticateRequest as never, async (context) =>
      buildSubject(context.user, mockMemberships),
    ),
  };
});
// Shared across instances so the delete assertions below can see the call.
const mockS3Send = jest.fn<(command: unknown) => Promise<unknown>>();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((params: unknown) => params),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((params: unknown) => ({ __type: 'GetObject', ...(params as object) })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((params: unknown) => ({ __type: 'DeleteObject', ...(params as object) })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockReturnValue('https://presigned.example.com/upload' as any),
}));
jest.mock('../report-service', () => ({
  fetchReportData: jest.fn(),
  generatePdf: jest.fn(),
  generateDocx: jest.fn(),
  uploadToS3: jest.fn(),
  saveReportRecord: jest.fn(),
  reportKeyPrefix: jest.fn((projectId: number) => `reports/${projectId}/`),
  objectUrlFor: jest.fn((key: string) => `https://bucket.s3.us-east-2.amazonaws.com/${key}`),
  keyFromObjectUrl: jest.fn((objectUrl: string) => {
    const prefix = 'https://bucket.s3.us-east-2.amazonaws.com/';
    return objectUrl.startsWith(prefix) ? objectUrl.slice(prefix.length) : null;
  }),
  getObjectSize: jest.fn(async () => null),
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

// Reports are admin-only, so a signed-in non-admin is the whole negative case.
const nonAdminAuthContext = {
  isAuthenticated: true as const,
  user: {
    cognitoSub: 'staff-sub',
    userId: 3,
    email: 'nour@branch.org',
    isAdmin: false,
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

  // Reports are admin-only end to end: `reports:generate` is declared on the
  // route, so a non-admin never reaches the controller and the per-project
  // access check the handler used to make is gone with it.
  test('403: a non-admin cannot generate a report at all', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
    const res = await handler(postEvent({ project_id: 1 }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
  });

  test('403: being a Director on the project does not help', async () => {
    mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
    mockMemberships.push({ project_id: 1, role: 'Director' });
    const res = await handler(postEvent({ project_id: 1 }));
    expect(res.statusCode).toBe(403);
  });

  test('400: invalid report_type returns 400', async () => {
    const res = await handler(postEvent({ project_id: 1, report_type: 'summary' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('report_type');
  });

  test('201: report_type=narrative is accepted and passed through to saveReportRecord', async () => {
    mockReportService.saveReportRecord.mockResolvedValue({
      report_id: 1,
      report_type: 'narrative',
      object_url: 'https://s3.example.com/reports/1/ts.pdf',
    });
    const res = await handler(postEvent({ project_id: 1, report_type: 'narrative' }));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).report_type).toBe('narrative');
    expect(mockReportService.saveReportRecord).toHaveBeenCalledWith(
      1,
      expect.any(String),
      expect.any(String),
      'narrative',
    );
  });

  test('201: a provided title is used as-is instead of the auto-generated one', async () => {
    const res = await handler(postEvent({ project_id: 1, title: 'Q3 Board Report' }));
    expect(res.statusCode).toBe(201);
    expect(mockReportService.saveReportRecord).toHaveBeenCalledWith(
      1,
      expect.any(String),
      'Q3 Board Report',
      'technical',
    );
  });

  test('201: a blank/whitespace title falls back to the auto-generated title', async () => {
    const res = await handler(postEvent({ project_id: 1, title: '    ' }));
    expect(res.statusCode).toBe(201);
    const [, , titleArg] = mockReportService.saveReportRecord.mock.calls[0];
    expect(titleArg).toContain('Test');
    expect(titleArg).not.toBe('    ');
  });

  test('201: an omitted title falls back to the auto-generated "<project> — <date>" title', async () => {
    const res = await handler(postEvent({ project_id: 1 }));
    expect(res.statusCode).toBe(201);
    const [, , titleArg] = mockReportService.saveReportRecord.mock.calls[0];
    expect(titleArg).toContain('Test');
    expect(titleArg).toContain('—');
  });
});

describe('GET /reports unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    // db.fn is used by pagination count queries; sum() reads project_rollup.
    mockDb.fn = {
      count: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
      sum: jest.fn().mockReturnValue({ as: jest.fn().mockReturnValue('count') }),
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

  // withSizes() is only invoked on the paginated branch of listReports (both
  // page and limit present) -- the unpaginated branch returns raw rows with no
  // file_size at all, so these live under Pagination rather than Response format.
  describe('File sizes (paginated results only)', () => {
    function mockPaginatedQuery(rows: typeof fakeReports) {
      mockDb.selectFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue({ count: String(rows.length) } as any),
        }),
      });
      mockDb.selectFrom.mockReturnValueOnce({
        selectAll: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockReturnValue({
                execute: jest.fn().mockReturnValue(rows as any),
              }),
            }),
          }),
        }),
      });
    }

    test('200: each report includes file_size sourced from getObjectSize', async () => {
      mockPaginatedQuery([fakeReports[0]]);
      mockReportService.getObjectSize.mockResolvedValue(4096);

      const res = await handler(getEvent({ page: '1', limit: '1' }));
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data[0].file_size).toBe(4096);
      expect(mockReportService.getObjectSize).toHaveBeenCalledWith(fakeReports[0].object_url);
    });

    test('200: file_size is null when getObjectSize cannot resolve the object', async () => {
      mockPaginatedQuery([fakeReports[0]]);
      mockReportService.getObjectSize.mockResolvedValue(null);

      const res = await handler(getEvent({ page: '1', limit: '1' }));
      const json = JSON.parse(res.body);
      expect(json.data[0].file_size).toBeNull();
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

    test('400: path traversal in fileName is stripped down to the basename, not treated as a path', async () => {
      const res = await handler(uploadUrlEvent({ fileName: '../../../etc/passwd.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.objectUrl).toContain('passwd.pdf');
      expect(body.objectUrl).not.toContain('..');
      expect(body.objectUrl).not.toContain('etc/passwd');
    });

    test('400: a fileName with no alphanumeric characters after sanitization is rejected', async () => {
      const res = await handler(uploadUrlEvent({ fileName: '....', projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Invalid fileName');
    });

    test('400: a fileName made only of disallowed symbols is rejected as invalid, not as an unsupported extension', async () => {
      const res = await handler(uploadUrlEvent({ fileName: '***.***', projectId: '1' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toBe('Invalid fileName');
    });
  });

  describe('Business logic', () => {
    test('404: project not found returns 404', async () => {
      setupProjectMock(undefined);
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '999' }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('403: a non-admin is refused, whatever their role on the project', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Director' });
      const res = await handler(uploadUrlEvent({ fileName: 'f.pdf', projectId: '1' }));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
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

describe('Route precedence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
  });

  // /reports/upload-url and /reports/:id both have two path segments, so
  // upload-url must be registered before :id or it gets swallowed as an id lookup.
  test('GET /reports/upload-url reaches getUploadUrl, not the /reports/:id controller', async () => {
    const res = await handler({
      rawPath: '/reports/upload-url',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: {},
    });
    // getUploadUrl-specific validation, not the 404 a numeric-id check on "upload-url" would give.
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('fileName is required');
  });

  test('POST /reports/generate reaches generateReport, not the generic POST /reports controller', async () => {
    const res = await handler({
      rawPath: '/reports/generate',
      requestContext: { http: { method: 'POST' } },
      headers: { Authorization: 'Bearer fake-token' },
      body: JSON.stringify({}),
    });
    // generateReport-specific validation, not createReport's 'title is required'.
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('project_id is required');
  });

  // /reports/{id}/download and /reports/{id} share the numeric-id segment, so
  // the three-segment download route must be matched before the two-segment
  // getReport route swallows it as an id lookup with a trailing extra segment.
  test('GET /reports/{id}/download reaches downloadReport, not the /reports/{id} controller', async () => {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue({
            report_id: 5,
            project_id: 1,
            object_url: 'https://bucket.s3.us-east-2.amazonaws.com/reports/1/gen.pdf',
          } as any),
        }),
      }),
    });
    const res = await handler({
      rawPath: '/reports/5/download',
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
      queryStringParameters: {},
    });
    // downloadReport-specific shape (downloadUrl/expiresIn), not getReport's
    // { ok, route: 'GET /reports/{id}', body } envelope.
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toBeDefined();
    expect(json.route).toBeUndefined();
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

    test("400: objectUrl under another project's prefix is rejected", async () => {
      const otherProjectUrl = 'https://bucket.s3.us-east-2.amazonaws.com/reports/2/123-report.pdf';
      const res = await handler(postEvent({ title: 'T', projectId: 1, objectUrl: otherProjectUrl }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("this project's prefix");
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
    test('403: a non-admin is refused, whatever their role on the project', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      mockMemberships.push({ project_id: 1, role: 'Director' });
      const res = await handler(postEvent({ title: 'T', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    });

    test('404: nonexistent project returns 404', async () => {
      setupProjectMock(undefined);
      const res = await handler(postEvent({ title: 'T', projectId: 999, objectUrl: fakeObjectUrl }));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Project not found');
    });

    test('201: creates report and returns created report', async () => {
      const fakeReport = { report_id: 10, project_id: 1, title: 'My Report', object_url: fakeObjectUrl, report_type: 'technical', date_created: new Date('2025-01-01') };
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
              executeTakeFirst: jest.fn().mockReturnValue({ report_id: 1, project_id: 1, title: vals.title, object_url: fakeObjectUrl, report_type: 'technical', date_created: new Date() } as any),
            }),
          };
        }),
      });

      await handler(postEvent({ title: '  My Report  ', projectId: 1, objectUrl: fakeObjectUrl }));
      expect(capturedValues.title).toBe('My Report');
    });
  });
});

describe('GET /reports/{id} unit tests', () => {
  function idEvent(method: 'GET' | 'DELETE', id: string) {
    return {
      rawPath: `/reports/${id}`,
      requestContext: { http: { method } },
      headers: { Authorization: 'Bearer fake-token' },
    };
  }

  const fakeReport = {
    report_id: 5,
    project_id: 2,
    title: 'Test Report',
    object_url: 'https://s3.amazonaws.com/reports/test.pdf',
    report_type: 'technical',
    date_created: new Date('2025-01-01'),
  };

  function setupReportMock(report: Record<string, unknown> | undefined) {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(report as any),
        }),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    setupReportMock(fakeReport);
  });

  describe('Validation', () => {
    test('404: non-numeric id falls through to catch-all', async () => {
      const res = await handler(idEvent('GET', 'abc'));
      expect(res.statusCode).toBe(404);
    });
  
    test('404: negative id falls through to catch-all', async () => {
      const res = await handler(idEvent('GET', '-5'));
      expect(res.statusCode).toBe(404);
    });
  
    test('404: decimal id falls through to catch-all', async () => {
      const res = await handler(idEvent('GET', '5.5'));
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Business logic', () => {
    test('404: report does not exist', async () => {
      setupReportMock(undefined);
      const res = await handler(idEvent('GET', '999'));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Report not found');
    });

    test('403: a non-admin cannot read a report', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    });

    test('200: returns report for user with project access', async () => {
      const res = await handler(idEvent('GET', '5'));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.ok).toBe(true);
      expect(json.route).toBe('GET /reports/{id}');
      expect(json.body.report_id).toBe(5);
      expect(json.body.project_id).toBe(2);
      expect(json.body.title).toBe('Test Report');
    });

    // Replaces an assertion on the removed checkProjectAccess helper: reading a
    // report is gated by `reports:view` on the route, which no non-admin passes
    // regardless of which project the report belongs to.
    test('403: a non-admin cannot read a report on any project', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      mockMemberships.push({ project_id: 2, role: 'Director' });
      const res = await handler(idEvent('GET', '5'));
      expect(res.statusCode).toBe(403);
    });
  });
});

describe('GET /reports/{id}/download unit tests', () => {
  function downloadEvent(id: string) {
    return {
      rawPath: `/reports/${id}/download`,
      requestContext: { http: { method: 'GET' } },
      headers: { Authorization: 'Bearer fake-token' },
    };
  }

  const storedReport = {
    report_id: 5,
    project_id: 2,
    title: 'Test Report',
    object_url: 'https://bucket.s3.us-east-2.amazonaws.com/reports/2/gen.pdf',
    report_type: 'technical',
    date_created: new Date('2025-01-01'),
  };

  function setupReportMock(report: Record<string, unknown> | undefined) {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(report as any),
        }),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    setupReportMock(storedReport);
  });

  describe('Validation', () => {
    test('404: non-numeric id falls through to catch-all', async () => {
      const res = await handler(downloadEvent('abc'));
      expect(res.statusCode).toBe(404);
    });

    test('404: negative id falls through to catch-all', async () => {
      const res = await handler(downloadEvent('-5'));
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(downloadEvent('5'));
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toBe('Authentication required');
    });
  });

  describe('Business logic', () => {
    test('404: report does not exist', async () => {
      setupReportMock(undefined);
      const res = await handler(downloadEvent('999'));
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Report not found');
    });

    test('403: a non-admin cannot download a report', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      const res = await handler(downloadEvent('5'));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
    });

    test('409: a report whose object_url cannot be resolved into a key under its project prefix is rejected', async () => {
      setupReportMock({ ...storedReport, object_url: 'https://not-our-bucket.example.com/other/file.pdf' });
      const res = await handler(downloadEvent('5'));
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).message).toBe('Report is not stored in the reports bucket');
    });

    test('200: returns a signed downloadUrl and expiresIn for a valid report', async () => {
      const res = await handler(downloadEvent('5'));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBe('https://presigned.example.com/upload');
      expect(body.expiresIn).toBe(900);
    });
  });
});

describe('DELETE /reports/{id} unit tests', () => {
  function idEvent(method: 'GET' | 'DELETE', id: string) {
    return {
      rawPath: `/reports/${id}`,
      requestContext: { http: { method } },
      headers: { Authorization: 'Bearer fake-token' },
    };
  }

  const fakeReport = {
    report_id: 5,
    project_id: 2,
    title: 'Test Report',
    object_url: 'https://s3.amazonaws.com/reports/test.pdf',
    report_type: 'technical',
    date_created: new Date('2025-01-01'),
  };

  function setupReportMock(report: Record<string, unknown> | undefined) {
    mockDb.selectFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockReturnValue(report as any),
        }),
      }),
    });
  }

  function setupDeleteMock(numDeletedRows: bigint) {
    mockDb.deleteFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        execute: jest.fn().mockReturnValue([{ numDeletedRows }]),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(adminAuthContext);
    setupReportMock(fakeReport);
    setupDeleteMock(1n);
  });

  describe('Validation', () => {
    test('404: non-numeric id falls through to catch-all', async () => {
      const res = await handler(idEvent('DELETE', 'abc'));
      expect(res.statusCode).toBe(404);
    });
  
    test('404: negative id falls through to catch-all', async () => {
      const res = await handler(idEvent('DELETE', '-1'));
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Authentication', () => {
    test('401: unauthenticated request is rejected', async () => {
      mockAuthenticateRequest.mockResolvedValue({ isAuthenticated: false });
      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Business logic', () => {
    test('404: report does not exist (checked before authorization)', async () => {
      setupReportMock(undefined);
      const res = await handler(idEvent('DELETE', '999'));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toBe('Report not found');
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    test('403: a non-admin cannot delete a report', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toBe('Only administrators can do this');
      expect(mockDb.deleteFrom).not.toHaveBeenCalled();
    });

    test('404: row already gone by the time delete executes (race condition)', async () => {
      setupDeleteMock(0n);
      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(404);
    });

    test('200: deletes report for user with project access', async () => {
      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.ok).toBe(true);
      expect(json.route).toBe('DELETE /reports/{id}');
      expect(json.pathParams).toEqual({ id: '5' });
    });

    test('403: a non-admin cannot delete a report on any project', async () => {
      mockAuthenticateRequest.mockResolvedValue(nonAdminAuthContext);
      mockMemberships.push({ project_id: 2, role: 'Director' });
      const res = await handler(idEvent('DELETE', '5'));
      expect(res.statusCode).toBe(403);
    });

    test('200: a report with no object_url deletes cleanly, fileDeleted is true, and S3 is never called', async () => {
      setupReportMock({ ...fakeReport, object_url: null });
      const res = await handler(idEvent('DELETE', '5'));

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).fileDeleted).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    describe('the generated file goes with the row', () => {
      const storedReport = {
        ...fakeReport,
        object_url: 'https://bucket.s3.us-east-2.amazonaws.com/reports/2/gen.pdf',
      };

      beforeEach(() => {
        process.env.REPORTS_BUCKET_NAME = 'bucket';
        setupReportMock(storedReport);
        mockS3Send.mockResolvedValue({});
      });

      test('deletes the object behind the report', async () => {
        const res = await handler(idEvent('DELETE', '5'));

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).fileDeleted).toBe(true);
        expect(mockS3Send).toHaveBeenCalledWith(
          expect.objectContaining({
            __type: 'DeleteObject',
            Bucket: 'bucket',
            Key: 'reports/2/gen.pdf',
          }),
        );
      });

      test('a failing S3 delete still deletes the row', async () => {
        // An orphaned object is recoverable; a row that cannot be deleted is
        // not, so S3 trouble must not turn a successful delete into a 500.
        mockS3Send.mockRejectedValue(new Error('AccessDenied'));

        const res = await handler(idEvent('DELETE', '5'));

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).fileDeleted).toBe(false);
      });

      test('the row is deleted before the object', async () => {
        const order: string[] = [];
        mockDb.deleteFrom = jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn(() => {
              order.push('row');
              return [{ numDeletedRows: 1n }];
            }),
          }),
        });
        mockS3Send.mockImplementation(async () => {
          order.push('object');
          return {};
        });

        await handler(idEvent('DELETE', '5'));

        // Reversed, a failed row delete would leave a row pointing at a file
        // that no longer exists.
        expect(order).toEqual(['row', 'object']);
      });
    });
  });
});