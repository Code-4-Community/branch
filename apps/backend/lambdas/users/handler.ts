import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getDatabase, toBoolean, toInteger } from './database';

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
    
    // PATCH /users/{userId}
    if (normalizedPath.startsWith('/users/') && normalizedPath.split('/').length === 3 && method === 'PATCH') {
      const userId = normalizedPath.split('/')[2];
      if (!userId) return json(400, { message: 'userId is required' });
      
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      
      // Validate userId is a number
      const userIdNum = parseInt(userId, 10);
      if (isNaN(userIdNum)) {
        return json(400, { message: 'Invalid userId format' });
      }
      
      // Extract and validate fields from body
      const { name, isAdmin } = body;
      
      // Validate field types if provided
      if (name !== undefined && typeof name !== 'string') {
        return json(400, { message: 'name must be a string' });
      }
      if (isAdmin !== undefined && typeof isAdmin !== 'boolean') {
        return json(400, { message: 'isAdmin must be a boolean' });
      }
      
      // At least one field must be provided
      if (name === undefined && isAdmin === undefined) {
        return json(400, { message: 'At least one field (name or isAdmin) must be provided' });
      }
      
      const db = getDatabase();
      
      // Check if user exists
      const existingUser = await db
        .selectFrom('user')
        .select(['id', 'email', 'name', 'isAdmin'])
        .where('id', '=', userIdNum)
        .executeTakeFirst();
      
      if (!existingUser) {
        return json(404, { message: 'User not found' });
      }
      
      // Build update object with only provided fields
      const updateData: Record<string, any> = {};
      if (name !== undefined) {
        updateData.name = name;
      }
      if (isAdmin !== undefined) {
        updateData.isAdmin = toInteger(isAdmin);
      }
      
      // Perform update
      await db
        .updateTable('user')
        .set(updateData)
        .where('id', '=', userIdNum)
        .execute();
      
      // Fetch and return updated user
      const updatedUser = await db
        .selectFrom('user')
        .select(['id', 'email', 'name', 'isAdmin'])
        .where('id', '=', userIdNum)
        .executeTakeFirstOrThrow();
      
      return json(200, {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        isAdmin: toBoolean(updatedUser.isAdmin)
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
