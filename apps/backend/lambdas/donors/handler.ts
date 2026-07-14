import { APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { authenticateRequest } from './auth';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const fullPath = event.rawPath || event.path || '/';
    // API Gateway mounts this service at /donors[/{proxy+}]; strip the mount
    // prefix so routing below (rawPath and normalizedPath) sees the bare path.
    const rawPath = fullPath.replace(/^\/donors(?=\/|$)/, '') || '/';
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

    // POST /donations
    if (normalizedPath === '/donations' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { donor_id, project_id, amount } = body;

      if (donor_id === undefined || project_id === undefined || amount === undefined) {
        return json(400, { message: 'donor_id, project_id, and amount are required' });
      }
      if (!Number.isInteger(donor_id) || (donor_id as number) < 1) {
        return json(400, { message: 'donor_id must be a positive integer' });
      }
      if (!Number.isInteger(project_id) || (project_id as number) < 1) {
        return json(400, { message: 'project_id must be a positive integer' });
      }
      if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
        return json(400, { message: 'amount must be a positive number' });
      }
      // Check user is admin or a member of the project
      if (!authContext.user?.isAdmin) {
      const userId = authContext.user!.userId as number;
      const membership = await db
        .selectFrom('branch.project_memberships')
        .select('membership_id')
        .where('project_id', '=', project_id as number)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!membership) {
        return json(403, { message: 'You must be a member' });
      }
    }

      try {
      const donation = await db
        .insertInto('branch.project_donations')
        .values({
          donor_id: donor_id as number,
          project_id: project_id as number,
          amount: amount as number,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return json(201, { data: donation });
    } catch (err: any) {
      if (err?.code === '23505') {
        return json(409, { message: 'A donation from this donor to this project already exists' });
      }
      throw err;
    }
    }

    // POST /donors
    if ((normalizedPath === '/' || normalizedPath === '/donors') && method === 'POST') {
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
