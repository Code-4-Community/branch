import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db'
import { authenticateRequest, checkAuthorization, AuthContext } from './auth';
import { UserValidationUtils } from './validation-utils';

function requireAuth(authContext: AuthContext, level: Parameters<typeof checkAuthorization>[1], resourceUserId?: number | string): APIGatewayProxyResult | undefined {
  const authCheck = checkAuthorization(authContext, level, resourceUserId);
  if (!authCheck.allowed) {
    return authContext.isAuthenticated
      ? json(403, { message: authCheck.reason || 'Forbidden' })
      : json(401, { message: 'Authentication required' });
  }
}


export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
    let normalizedPath = rawPath.replace(/\/$/, '');
    if (normalizedPath.length === 0) {
      normalizedPath = '/';
    }
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

        console.log('DEBUG - rawPath:', rawPath, 'normalizedPath:', normalizedPath, 'method:', method);

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    const authContext: AuthContext = await authenticateRequest(event);


    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    

    // GET /users
    if ((normalizedPath === '/users' || normalizedPath === '' || normalizedPath === '/') && method === 'GET') {
      const authError = requireAuth(authContext, 'ADMIN');
      if (authError) return authError;
    
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
      const authError = requireAuth(authContext, 'ADMIN_OR_SELF', userId);
      if (authError) return authError;

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
          isAdmin: user.is_admin,
          profile_image: user.profile_image,
        } 
      });
    }
    
    // PATCH /{userId} (dev server strips /users prefix)
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'PATCH') {
      const userId = normalizedPath.split('/')[1];
      const authError = requireAuth(authContext, 'ADMIN_OR_SELF', userId);
      if (authError) return authError;
      
      if (!userId) return json(400, { message: 'userId is required' });
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

      // make sure user exists
      let user = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();
      if (!user) return json(404, { message: 'User not found' });

      const updates: { email?: string; name?: string; is_admin?: boolean; profile_image?: string } = {};

      const emailResult = UserValidationUtils.validateEmail(body.email);
      if (!emailResult.isValid) return json(400, { message: emailResult.error });
      if (emailResult.value != null) updates.email = emailResult.value;

      const nameResult = UserValidationUtils.validateName(body.name);
      if (!nameResult.isValid) return json(400, { message: nameResult.error });
      if (nameResult.value != null) updates.name = nameResult.value;

      const isAdminResult = UserValidationUtils.validateIsAdmin(body.isAdmin);
      if (!isAdminResult.isValid) return json(400, { message: isAdminResult.error });
      if (isAdminResult.value != null) updates.is_admin = isAdminResult.value;

      const profileImageResult = UserValidationUtils.validateProfileImage(body.profileImage);
      if (!profileImageResult.isValid) return json(400, { message: profileImageResult.error });
      if (profileImageResult.value != null) updates.profile_image = profileImageResult.value;

      if (Object.keys(updates).length === 0) {
        return json(400, { message: 'No valid fields provided to update' });
      }

      // update
      await db.updateTable('branch.users')
               .set(updates)
               .where('user_id', '=', Number(userId))
               .execute();

      // get updated user
      let updatedUser = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();

      return json(200, { ok: true, route: 'PATCH /users/{userId}', pathParams: { userId }, body: { email: updatedUser!.email, name: updatedUser!.name, isAdmin: updatedUser!.is_admin, profileImage: updatedUser!.profile_image } });
    }
    
    // DELETE /users/{userId}
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'DELETE') {
      const authError = requireAuth(authContext, 'ADMIN');
      if (authError) return authError;

      const userId = normalizedPath.split('/')[1];
      if (!userId) return json(400, { message: 'userId is required' });
      
      const deleted = await db.deleteFrom('branch.users').where('user_id', '=', Number(userId)).execute();
    
      if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
        return json(404, { message: 'User not found' });
      }

      return json(200, { ok: true, route: 'DELETE /users/{userId}', pathParams: { userId } });
    }

    // POST /users
    if ((normalizedPath === '/' || normalizedPath === '/users') && method === 'POST') {
      const authError = requireAuth(authContext, 'ADMIN');
      if (authError) return authError;

      const body = event.body
        ? (JSON.parse(event.body) as Record<string, unknown>)
        : {};

      // email, name, and isAdmin are required on create
      if (!body.email || !body.name || typeof body.isAdmin !== 'boolean') {
        return json(400, { message: 'email, name, and isAdmin are required' });
      }

      // validate the type/format of each field
      const emailResult = UserValidationUtils.validateEmail(body.email);
      if (!emailResult.isValid) return json(400, { message: emailResult.error });

      const profileImageResult = UserValidationUtils.validateProfileImage(body.profileImage);
      if (!profileImageResult.isValid) return json(400, { message: profileImageResult.error });

      const email = emailResult.value as string;
      const name = body.name as string;
      const isAdmin = body.isAdmin;
      const profile_image = profileImageResult.value ?? undefined;

      // Check if user with this email already exists
      const existingUser = await db
        .selectFrom('branch.users')
        .where('email', '=', email)
        .selectAll()
        .executeTakeFirst();

      if (existingUser) {
        return json(409, { message: 'User with this email already exists' });
      }
        
      // insert new user (user_id auto-increments)
      try {
        await db
          .insertInto('branch.users')
          .values({ email, name, is_admin: isAdmin, profile_image })
          .execute();
      } catch (err) {
        console.error('Database insert error:', err);
        return json(500, { message: 'Failed to create user' });
      }

      return json(201, {
        ok: true,
        route: 'POST /users',
        pathParams: {},
        body: {
          email,
          name,
          isAdmin,
        },
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