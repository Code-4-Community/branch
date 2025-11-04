import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db';

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
    
    // GET /projects/{id}/donors
    if (normalizedPath.startsWith('/projects/') && normalizedPath.split('/').length === 4 && method === 'GET') {
      const id = normalizedPath.split('/')[2];
      if (!id) return json(400, { message: 'id is required' });
      // TODO: Add your business logic here
      const donors = await db.selectFrom("branch.projects").where("project_id", "=", Number(id)).innerJoin(
      "branch.project_donations",
      "branch.project_donations.project_id",
      "branch.projects.project_id"
    ).innerJoin(
      "branch.donors",
      "branch.donors.donor_id",
      "branch.project_donations.donor_id"
    ).selectAll().execute();
      return json(200, { donors });
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
