import { APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { authenticateRequest } from './auth';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return json(200, {});
    }

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    const authContext = await authenticateRequest(event);
    if (!authContext.isAuthenticated) {
      return json(401, { message: 'Authentication required' });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here

    // GET /donors
    if (rawPath === '/' && method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const pageStr = queryParams.page as string | undefined;
      const limitStr = queryParams.limit as string | undefined;

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

      const page = pageStr ? parseInt(pageStr, 10) : null;
      const limit = limitStr ? parseInt(limitStr, 10) : null;

      if (page && limit) {
        const offset = (page - 1) * limit;

        const totalCount = await db
          .selectFrom('branch.donors')
          .select(db.fn.count('donor_id').as('count'))
          .executeTakeFirst();

        const totalItems = Number(totalCount?.count || 0);
        const totalPages = Math.ceil(totalItems / limit);

        const donors = await db
          .selectFrom('branch.donors')
          .selectAll()
          .orderBy('donor_id', 'asc')
          .limit(limit)
          .offset(offset)
          .execute();

        return json(200, {
          data: donors,
          pagination: { page, limit, totalItems, totalPages },
        });
      }

      const donors = await db.selectFrom('branch.donors').selectAll().execute();
      return json(200, { data: donors });
    }

    // GET /donations
    if ((normalizedPath === '/donations') && method === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const pageStr = queryParams.page as string | undefined;
      const limitStr = queryParams.limit as string | undefined;

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

      const page = pageStr ? parseInt(pageStr, 10) : null;
      const limit = limitStr ? parseInt(limitStr, 10) : null;

      if (page && limit) {
        const offset = (page - 1) * limit;

        const totalCount = await db
          .selectFrom('branch.project_donations')
          .select(db.fn.count('donation_id').as('count'))
          .executeTakeFirst();

        const totalItems = Number(totalCount?.count || 0);
        const totalPages = Math.ceil(totalItems / limit);

        const donations = await db
          .selectFrom('branch.project_donations')
          .selectAll()
          .orderBy('donation_id', 'asc')
          .limit(limit)
          .offset(offset)
          .execute();

        return json(200, {
          data: donations,
          pagination: { page, limit, totalItems, totalPages },
        });
      }

      const donations = await db
        .selectFrom('branch.project_donations')
        .selectAll()
        .execute();
      return json(200, { data: donations });
    }

    // POST /donors
    if (normalizedPath === '/donors' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      // TODO: Add your business logic here
      return json(201, { ok: true, route: 'POST /donors', body });
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
