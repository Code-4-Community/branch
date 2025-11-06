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
    const parts = normalizedPath.split('/');
    if (parts.length === 3 && parts[2] === 'donors' && method === 'GET') {
      const id = parts[1];
      if (!id) return json(400, { message: 'id is required' });

      if (isNaN(Number(id))) {
        return json(400, { message: 'Project id must be a valid number' });
      }

      const queryString = event.rawQueryString || event.queryStringParameters;
      if (queryString && (typeof queryString === 'string' ? queryString.length > 0 : Object.keys(queryString).length > 0)) {
        return json(400, { message: 'Bad Request: Query parameters are not allowed' });
      }

      // TODO: Add your business logic here
      const project = await db
        .selectFrom("branch.projects as p")
        .where("p.project_id", "=", Number(id))
        .selectAll()
        .executeTakeFirst();
      
      if (!project) {
        return json(404, { message: 'Project not found' });
      }

      const donors = await db.selectFrom("branch.projects as p").where("p.project_id", "=", Number(id)).innerJoin(
      "branch.project_donations as bpd",
      "bpd.project_id",
      "p.project_id"
    ).innerJoin(
      "branch.donors as bd",
      "bd.donor_id",
      "bpd.donor_id"
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
