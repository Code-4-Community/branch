import { APIGatewayProxyResult } from 'aws-lambda';
import { dispatch, json, RouteCtx } from '@branch/lambda-http';
import db from './db';
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

// GET /users
async function listUsers({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext: AuthContext = await authenticateRequest(event);
  const authError = requireAuth(authContext, 'ADMIN');
  if (authError) return authError;

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
      pagination: { page, limit, totalUsers, totalPages },
    });
  }

  const users = await db.selectFrom('branch.users').selectAll().execute();
  return json(200, { users });
}

// GET /users/{userId}
async function getUser({ event, params }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext: AuthContext = await authenticateRequest(event);
  const userId = params.userId;
  const authError = requireAuth(authContext, 'ADMIN_OR_SELF', userId);
  if (authError) return authError;

  if (!userId) return json(400, { message: 'userId is required' });

  const user = await db.selectFrom('branch.users').where('user_id', '=', Number(userId)).selectAll().executeTakeFirst();
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
    },
  });
}

// PATCH /users/{userId}
async function patchUser({ event, params }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext: AuthContext = await authenticateRequest(event);
  const userId = params.userId;
  const authError = requireAuth(authContext, 'ADMIN_OR_SELF', userId);
  if (authError) return authError;

  if (!userId) return json(400, { message: 'userId is required' });
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  // make sure user exists
  const user = await db.selectFrom('branch.users').where('user_id', '=', Number(userId)).selectAll().executeTakeFirst();
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
  const updatedUser = await db.selectFrom('branch.users').where('user_id', '=', Number(userId)).selectAll().executeTakeFirst();

  return json(200, { ok: true, route: 'PATCH /users/{userId}', pathParams: { userId }, body: { email: updatedUser!.email, name: updatedUser!.name, isAdmin: updatedUser!.is_admin, profileImage: updatedUser!.profile_image } });
}

// DELETE /users/{userId}
async function deleteUser({ event, params }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext: AuthContext = await authenticateRequest(event);
  const authError = requireAuth(authContext, 'ADMIN');
  if (authError) return authError;

  const userId = params.userId;
  if (!userId) return json(400, { message: 'userId is required' });

  const deleted = await db.deleteFrom('branch.users').where('user_id', '=', Number(userId)).execute();

  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'User not found' });
  }

  return json(200, { ok: true, route: 'DELETE /users/{userId}', pathParams: { userId } });
}

// POST /users
async function createUser({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext: AuthContext = await authenticateRequest(event);
  const authError = requireAuth(authContext, 'ADMIN');
  if (authError) return authError;

  const body = event.body
    ? (JSON.parse(event.body) as Record<string, unknown>)
    : {};

  // email, name, and isAdmin are required on create
  if (!body.email || !body.name || body.isAdmin === undefined || body.isAdmin === null) {
    return json(400, { message: 'email, name, and isAdmin are required' });
  }

  // validate the type/format of each field
  const emailResult = UserValidationUtils.validateEmail(body.email);
  if (!emailResult.isValid) return json(400, { message: emailResult.error });

  const nameResult = UserValidationUtils.validateName(body.name);
  if (!nameResult.isValid) return json(400, { message: nameResult.error });

  const isAdminResult = UserValidationUtils.validateIsAdmin(body.isAdmin);
  if (!isAdminResult.isValid) return json(400, { message: isAdminResult.error });

  const profileImageResult = UserValidationUtils.validateProfileImage(body.profileImage);
  if (!profileImageResult.isValid) return json(400, { message: profileImageResult.error });

  const email = emailResult.value as string;
  const name = nameResult.value as string;
  const isAdmin = isAdminResult.value as boolean;
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
    body: { email, name, isAdmin },
  });
}

export const handler = (event: any): Promise<APIGatewayProxyResult> =>
  dispatch(event, {
    prefix: 'users',
    routes: [
      { method: 'GET', pattern: '/users', handler: listUsers },
      { method: 'POST', pattern: '/users', handler: createUser },
      { method: 'GET', pattern: '/users/:userId', handler: getUser },
      { method: 'PATCH', pattern: '/users/:userId', handler: patchUser },
      { method: 'DELETE', pattern: '/users/:userId', handler: deleteUser },
    ],
  });
