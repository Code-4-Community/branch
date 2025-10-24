import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db'


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
    
    // GET /users
    if (normalizedPath === '/users' && method === 'GET') {
      // TODO: Add your business logic here
        const queryParams = event.queryStringParameters || {};
        const page = queryParams.page ? parseInt(queryParams.page, 10) : null;
        const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : null;

        if (page && limit) {
            const offset = (page - 1) * limit;

            const totalCount = await db
                .selectFrom('branch.users')
                .select(db.fn.count('user_id').as('count'))
                .executeTakeFirst();

            const totalUsers = Number(totalCount?.count || 0);
            const totalPages = Math.ceil(totalUsers / limit);

            const users = await db
                .selectFrom('branch.users')
                .selectAll()
                .limit(limit)
                .offset(offset)
                .execute();
            return json(200, {
                users,
                pagination: {
                    page,
                    limit,
                    totalUsers,
                    totalPages
                }
            });
        }

        const users = await db
            .selectFrom('branch.users')
            .selectAll()
            .execute();
      
      console.log(users);
      return json(200, { users });
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