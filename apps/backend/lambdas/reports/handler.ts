import { APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import db from './db';
import { authenticateRequest } from './auth';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });
const BUCKET = process.env.S3_BUCKET_NAME ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-2';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'] as const;
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here

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
    
    // POST /reports
    if (normalizedPath === '/reports' && method === 'POST') {
      const authContext = await authenticateRequest(event);
      if (!authContext.isAuthenticated) {
        return json(401, { message: 'Authentication required' });
      }

      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return json(400, { message: 'Invalid JSON in request body' });
      }

      const { title, projectId, fileName, fileContent } = body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return json(400, { message: 'title is required' });
      }
      if (!projectId || typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId < 1) {
        return json(400, { message: 'projectId must be a positive integer' });
      }
      if (!fileName || typeof fileName !== 'string') {
        return json(400, { message: 'fileName is required' });
      }
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
        return json(400, { message: 'Only PDF and DOCX files are supported' });
      }
      if (!fileContent || typeof fileContent !== 'string') {
        return json(400, { message: 'fileContent must be a base64 encoded string' });
      }

      const project = await db
        .selectFrom('branch.projects')
        .where('project_id', '=', projectId)
        .select('project_id')
        .executeTakeFirst();

      if (!project) {
        return json(404, { message: 'Project not found' });
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(fileContent, 'base64');
      } catch {
        return json(400, { message: 'fileContent must be a valid base64 string' });
      }

      const key = `reports/${projectId}/${Date.now()}-${fileName}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: MIME_TYPES[ext],
      }));

      const objectUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

      const report = await db
        .insertInto('branch.reports')
        .values({ project_id: projectId, title: title.trim(), object_url: objectUrl })
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
