import { APIGatewayProxyResult } from 'aws-lambda';
import { authenticateRequest } from './auth';
import {
  checkProjectAccess,
  fetchReportData,
  generatePdf,
  uploadToS3,
  saveReportRecord,
} from './report-service';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    
    // POST /reports
    if ((normalizedPath === '/reports' || normalizedPath === '' || normalizedPath === '/') && method === 'POST') {
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

      const hasAccess = await checkProjectAccess(user.userId!, projectId, user.isAdmin);
      if (!hasAccess) {
        return json(403, { message: 'You do not have access to generate reports for this project' });
      }

      const reportData = await fetchReportData(projectId);
      if (!reportData) {
        return json(404, { message: 'Project not found' });
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(reportData);
      } catch (err) {
        console.error('PDF generation error:', err);
        return json(500, { message: 'Failed to generate report PDF' });
      }

      let objectUrl: string;
      try {
        objectUrl = await uploadToS3(pdfBuffer, projectId);
      } catch (err) {
        console.error('S3 upload error:', err);
        return json(500, { message: 'Failed to upload report' });
      }

      const record = await saveReportRecord(projectId, objectUrl);

      return json(201, {
        ok: true,
        report_id: record.report_id,
        object_url: record.object_url,
      });
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
