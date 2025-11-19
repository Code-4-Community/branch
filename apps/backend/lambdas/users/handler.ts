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

        console.log('DEBUG - rawPath:', rawPath, 'normalizedPath:', normalizedPath, 'method:', method);

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    

    // GET /users
    if ((normalizedPath === '/users' || normalizedPath === '' || normalizedPath === '/') && method === 'GET') {
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
                .orderBy('user_id', 'asc')
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

    // GET /{userId}
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'GET') {
      const userId = normalizedPath.split('/')[1];
      if (!userId) return json(400, { message: 'userId is required' });

      const user = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();
      if (!user) return json(404, { message: 'User not found' });
      
      return json(200, { 
        ok: true, 
        route: 'GET /users/{userId}', 
        pathParams: { userId }, 
        body: { 
          userId: user.user_id,
          email: user.email, 
          name: user.name, 
          isAdmin: user.is_admin 
        } 
      });
    }
    
    // PATCH /{userId} (dev server strips /users prefix)
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'PATCH') {
      const userId = normalizedPath.split('/')[1];
      if (!userId) return json(400, { message: 'userId is required' });
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

      // make sure user exists
      let user = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();
      if (!user) return json(404, { message: 'User not found' });

      // vars to update
      let email = body.email as string;
      let name = body.name as string;
      let isAdmin = body.isAdmin as boolean;

      // update
      await db.updateTable('branch.users')
               .set({ email, name, is_admin: isAdmin })
               .where('user_id', '=', Number(userId))
               .execute();

      // get updated user
      let updatedUser = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();

      return json(200, { ok: true, route: 'PATCH /users/{userId}', pathParams: { userId }, body: { email: updatedUser!.email, name: updatedUser!.name, isAdmin: updatedUser!.is_admin } });
    }
    
    // DELETE /users/{userId}
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'DELETE') {
      const userId = normalizedPath.split('/')[1];  // Change from [2] to [1]
      if (!userId) return json(400, { message: 'userId is required' });

      const deleted = await db.deleteFrom('branch.users').where('user_id', '=', Number(userId)).execute();
    
      if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
        return json(404, { message: 'User not found' });
      }

      return json(200, { ok: true, route: 'DELETE /users/{userId}', pathParams: { userId } });
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