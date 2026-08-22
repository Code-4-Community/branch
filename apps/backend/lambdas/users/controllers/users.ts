import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, createAuthGuard, type RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { authenticateRequest } from '../auth';
import { UserValidationUtils } from '../validation-utils';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

const guard = createAuthGuard(authenticateRequest);

export const listUsers: RouteHandler = async ({ event }) => {
  const auth = await guard(event, 'ADMIN');
  if (auth.response) return auth.response;

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

  return json(200, { users });
};

export const getUser: RouteHandler = async ({ event, params }) => {
  const userId = params.userId;
  const auth = await guard(event, 'ADMIN_OR_SELF', userId);
  if (auth.response) return auth.response;

  if (!/^\d+$/.test(userId)) return json(400, { message: 'userId must be a positive integer' });

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
};

export const patchUser: RouteHandler = async ({ event, params }) => {
  const userId = params.userId;
  const auth = await guard(event, 'ADMIN_OR_SELF', userId);
  if (auth.response) return auth.response;
  const authContext = auth.ctx;

  if (!/^\d+$/.test(userId)) return json(400, { message: 'userId must be a positive integer' });
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  // make sure user exists
  let user = await db.selectFrom("branch.users").where("user_id", "=", Number(userId)).selectAll().executeTakeFirst();
  if (!user) return json(404, { message: 'User not found' });

  const updates: { name?: string; is_admin?: boolean; profile_image?: string } = {};

  // email is the Cognito username and nothing here syncs it, so it is immutable
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    return json(400, { message: 'email cannot be changed' });
  }

  const nameResult = UserValidationUtils.validateName(body.name);
  if (!nameResult.isValid) return json(400, { message: nameResult.error });
  if (nameResult.value != null) updates.name = nameResult.value;

  const isAdminResult = UserValidationUtils.validateIsAdmin(body.isAdmin);
  if (!isAdminResult.isValid) return json(400, { message: isAdminResult.error });
  if (isAdminResult.value != null) {
    // is_admin is a privilege grant, not profile data. The ADMIN_OR_SELF
    // check above intentionally lets a non-admin PATCH their own row, so
    // without this gate any user could PATCH { isAdmin: true } to their own
    // userId and self-promote. validateIsAdmin returns value: null when the
    // field is absent, so ordinary self-service edits are unaffected.
    if (!authContext.user?.isAdmin) {
      return json(403, { message: 'Only an admin can change isAdmin' });
    }
    updates.is_admin = isAdminResult.value;
  }

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
};

export const deleteUser: RouteHandler = async ({ event, params }) => {
  const auth = await guard(event, 'ADMIN');
  if (auth.response) return auth.response;

  const userId = params.userId;
  if (!/^\d+$/.test(userId)) return json(400, { message: 'userId must be a positive integer' });

  const user = await db.selectFrom('branch.users').where('user_id', '=', Number(userId)).select('email').executeTakeFirst();
  if (!user) return json(404, { message: 'User not found' });

  const deleted = await db.deleteFrom('branch.users').where('user_id', '=', Number(userId)).execute();

  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'User not found' });
  }

  // the Cognito user must go too, or the email can never be re-invited
  let cognitoDeleted = true;
  if (!USER_POOL_ID) {
    console.error('COGNITO_USER_POOL_ID is not set; skipping Cognito delete for', user.email);
    cognitoDeleted = false;
  } else {
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email }));
    } catch (err: any) {
      if (err?.name !== 'UserNotFoundException') {
        console.error('Cognito delete error:', err);
        cognitoDeleted = false;
      }
    }
  }

  return json(200, { ok: true, route: 'DELETE /users/{userId}', pathParams: { userId }, cognitoDeleted });
};

export const createUser: RouteHandler = async ({ event }) => {
  const auth = await guard(event, 'ADMIN');
  if (auth.response) return auth.response;

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

  // Check if user with this email already exists in DB
  const existingUser = await db
    .selectFrom('branch.users')
    .where('email', '=', email)
    .selectAll()
    .executeTakeFirst();

  if (existingUser) {
    return json(409, { message: 'User with this email already exists' });
  }

  // Create user in Cognito via AdminCreateUser — sends invite email with temp password
  let cognitoSub: string;
  try {
    const cognitoResponse = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
      ],
    }));
    const sub = cognitoResponse.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!sub) throw new Error('No sub returned from AdminCreateUser');
    cognitoSub = sub;
  } catch (err: any) {
    console.error('Cognito AdminCreateUser error:', err);
    if (err.name === 'UsernameExistsException') {
      return json(409, { message: 'User with this email already exists' });
    }
    return json(500, { message: 'Failed to create user in authentication service' });
  }

  // Insert into database with cognito_sub
  try {
    await db
      .insertInto('branch.users')
      .values({ cognito_sub: cognitoSub, email, name, is_admin: isAdmin, profile_image })
      .execute();
  } catch (err: any) {
    console.error('Database insert error:', err);
    // Rollback: delete Cognito user to keep systems in sync
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
      }));
      console.log('Rolled back Cognito user after database failure');
    } catch (rollbackErr) {
      console.error('Failed to rollback Cognito user:', rollbackErr);
    }
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
};
