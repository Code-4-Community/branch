import { APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import db from './db';
import { authenticateRequest } from './auth';
import {
  checkProjectAccess,
  fetchReportData,
  generatePdf,
  generateDocx,
  uploadToS3,
  saveReportRecord,
} from './report-service';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-2';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'] as const;
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type FileType = typeof ALLOWED_EXTENSIONS[number];

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return json(200, {});
    }

    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here

    // POST /reports/generate
    if ((normalizedPath === '/reports/generate' || normalizedPath === '/generate') && method === 'POST') {
      const authContext = await authenticateRequest(event);
      if (!authContext.isAuthenticated || !authContext.user) {
        return json(401, { message: 'Authentication required' });
      }

      const { user } = authContext;
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

      const projectId = body.project_id;
      if (projectId === undefined || projectId === null) {
        return json(400, { message: 'project_id is required' });
      }
      if (typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId <= 0) {
        return json(400, { message: 'project_id must be a positive integer' });
      }

      const fileType = (body.file_type ?? 'pdf') as FileType;
      if (!ALLOWED_EXTENSIONS.includes(fileType)) {
        return json(400, { message: `file_type must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` });
      }

      const reportData = await fetchReportData(projectId);
      if (!reportData) {
        return json(404, { message: 'Project not found' });
      }

      const hasAccess = await checkProjectAccess(user.userId!, projectId, user.isAdmin ?? false);
      if (!hasAccess) {
        return json(403, { message: 'You do not have access to generate reports for this project' });
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = fileType === 'docx' ? await generateDocx(reportData) : await generatePdf(reportData);
      } catch (err) {
        console.error('Report generation error:', err);
        return json(500, { message: 'Failed to generate report' });
      }

      let objectUrl: string;
      try {
        objectUrl = await uploadToS3(fileBuffer, projectId, fileType);
      } catch (err) {
        console.error('S3 upload error:', err);
        return json(500, { message: 'Failed to upload report' });
      }

      const title = `${reportData.project.name} — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      const record = await saveReportRecord(projectId, objectUrl, title);

      return json(201, {
        ok: true,
        report_id: record.report_id,
        object_url: record.object_url,
        report_type: record.report_type,
      });
    }

    // GET /reports
    if ((normalizedPath === '/reports' || normalizedPath === '' || normalizedPath === '/') && method === 'GET') {
      const authContext = await authenticateRequest(event);
      if (!authContext.isAuthenticated) {
        return json(401, { message: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const pageStr = queryParams.page as string | undefined;
      const limitStr = queryParams.limit as string | undefined;
      const projectIdStr = queryParams.projectId as string | undefined;

      if (pageStr !== undefined) {
        if (!/^\d+$/.test(pageStr) || parseInt(pageStr, 10) < 1) {
          return json(400, { message: 'page must be a positive integer' });
        }
      }

      if (limitStr !== undefined) {
        if (!/^\d+$/.test(limitStr) || parseInt(limitStr, 10) < 1) {
          return json(400, { message: 'limit must be a positive integer' });
        }
      }

      if (projectIdStr !== undefined) {
        if (!/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
          return json(400, { message: 'projectId must be a positive integer' });
        }
      }

      const page = pageStr ? parseInt(pageStr, 10) : null;
      const limit = limitStr ? parseInt(limitStr, 10) : null;
      const projectId = projectIdStr ? parseInt(projectIdStr, 10) : null;

      if (page && limit) {
        const offset = (page - 1) * limit;

        const totalCount = projectId !== null
          ? await db.selectFrom('branch.reports').where('project_id', '=', projectId).select(db.fn.count('report_id').as('count')).executeTakeFirst()
          : await db.selectFrom('branch.reports').select(db.fn.count('report_id').as('count')).executeTakeFirst();

        const totalItems = Number(totalCount?.count || 0);
        const totalPages = Math.ceil(totalItems / limit);

        const reports = projectId !== null
          ? await db.selectFrom('branch.reports').where('project_id', '=', projectId).selectAll().orderBy('date_created', 'desc').limit(limit).offset(offset).execute()
          : await db.selectFrom('branch.reports').selectAll().orderBy('date_created', 'desc').limit(limit).offset(offset).execute();

        return json(200, {
          data: reports,
          pagination: { page, limit, totalItems, totalPages },
        });
      }

      const reports = projectId !== null
        ? await db.selectFrom('branch.reports').where('project_id', '=', projectId).selectAll().orderBy('date_created', 'desc').execute()
        : await db.selectFrom('branch.reports').selectAll().orderBy('date_created', 'desc').execute();

      return json(200, { data: reports });
    }
    
    // GET /reports/upload-url
    if ((normalizedPath === '/reports/upload-url' || normalizedPath === '/upload-url') && method === 'GET') {
      const authContext = await authenticateRequest(event);
      if (!authContext.isAuthenticated || !authContext.user) {
        return json(401, { message: 'Authentication required' });
      }

      const { user } = authContext;

      const queryParams = event.queryStringParameters || {};
      const { fileName, projectId: projectIdStr } = queryParams;

      if (!fileName || typeof fileName !== 'string') {
        return json(400, { message: 'fileName is required' });
      }
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
        return json(400, { message: 'Only PDF and DOCX files are supported' });
      }
      if (!projectIdStr || !/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
        return json(400, { message: 'projectId must be a positive integer' });
      }
      const projectId = parseInt(projectIdStr, 10);

      const projectExists = await db.selectFrom('branch.projects')
        .where('project_id', '=', projectId)
        .select('project_id')
        .executeTakeFirst();
      if (!projectExists) return json(404, { message: 'Project not found' });

      const hasAccess = await checkProjectAccess(user.userId!, projectId, user.isAdmin);
      if (!hasAccess) {
        return json(403, { message: 'You do not have access to upload reports for this project' });
      }

      const key = `reports/${projectId}/${Date.now()}-${fileName}`;
      const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: MIME_TYPES[ext],
      }), { expiresIn: 3600 });

      const objectUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

      return json(200, { uploadUrl, objectUrl });
    }

    // POST /reports
    if ((normalizedPath === '/reports' || normalizedPath === '' || normalizedPath === '/') && method === 'POST') {
      const authContext = await authenticateRequest(event);
      if (!authContext.isAuthenticated || !authContext.user) {
        return json(401, { message: 'Authentication required' });
      }

      const { user } = authContext;

      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return json(400, { message: 'Invalid JSON in request body' });
      }

      const { title, projectId, objectUrl, reportType } = body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return json(400, { message: 'title is required' });
      }
      if (!projectId || typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId < 1) {
        return json(400, { message: 'projectId must be a positive integer' });
      }
      if (!objectUrl || typeof objectUrl !== 'string') {
        return json(400, { message: 'objectUrl is required' });
      }
      const REPORT_TYPES = ['technical', 'narrative'] as const;
      type ReportType = typeof REPORT_TYPES[number];
      const resolvedReportType: ReportType = (reportType && REPORT_TYPES.includes(reportType as ReportType)) ? reportType as ReportType : 'technical';

      const projectExists = await db.selectFrom('branch.projects')
        .where('project_id', '=', projectId as number)
        .select('project_id')
        .executeTakeFirst();
      if (!projectExists) return json(404, { message: 'Project not found' });

      const hasAccess = await checkProjectAccess(user.userId!, projectId as number, user.isAdmin);
      if (!hasAccess) {
        return json(403, { message: 'You do not have access to upload reports for this project' });
      }

      const report = await db
        .insertInto('branch.reports')
        .values({ project_id: projectId, title: (title as string).trim(), object_url: objectUrl as string, report_type: resolvedReportType })
        .returningAll()
        .executeTakeFirst();

      return json(201, report);
    }
    // <<< ROUTES-END 

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
