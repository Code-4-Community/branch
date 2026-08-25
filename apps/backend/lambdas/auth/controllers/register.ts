import { APIGatewayProxyResult } from 'aws-lambda';
import {
  SignUpCommand,
  SignUpCommandInput,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ConfirmSignUpCommand,
  ConfirmSignUpCommandInput,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, reportError, serverError } from '@branch/lambda-http';
import db from '../db';
import { cognitoClient, USER_POOL_CLIENT_ID, USER_POOL_ID, validatePassword } from '../services/cognito';

export async function handleRegister(event: any): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return json(400, {
        message: 'Missing required fields',
        required: ['email', 'password', 'name'],
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json(400, { message: 'Invalid email format' });
    }

    // Validate password requirements
    const passwordError = validatePassword(password);
    if (passwordError) {
      return json(400, { message: passwordError });
    }

    // Validate name
    if (name.trim().length < 2) {
      return json(400, { message: 'Name must be at least 2 characters long' });
    }

    // A branch.users row with cognito_sub IS NULL is a PENDING INVITATION, not a
    // conflict. Two paths create them: the db/seed.sql rows and admin
    // POST /users. Before claim-on-register both were permanently unable to sign
    // in -- registration 409'd on the email, and lambda-auth's authenticateRequest
    // can never match a NULL cognito_sub.
    const existingUser = await db
      .selectFrom('branch.users')
      .where('email', '=', email.toLowerCase())
      .selectAll()
      .executeTakeFirst();

    if (existingUser && existingUser.cognito_sub) {
      return json(409, { message: 'User with this email already exists' });
    }

    // REGISTRATION IS INVITATION-ONLY. This endpoint is public and
    // unauthenticated, so without this gate anyone could create a working
    // account for themselves. An account is only meaningful once a branch.users
    // row exists -- authenticateRequest rejects any Cognito identity whose sub
    // has no row -- so refusing to create that row here is the control.
    //
    // The invitation must be created first by an admin via the ADMIN-gated
    // POST /users, which inserts a row with a NULL cognito_sub.
    //
    // 403 rather than 404: this endpoint must not become an oracle for which
    // email addresses have been invited, so the response is deliberately the
    // same whether or not the address is known.
    if (!existingUser) {
      return json(403, {
        message:
          'Registration is by invitation only. Ask an administrator to create your account.',
        code: 'INVITATION_REQUIRED',
      });
    }

    const claimingUserId: number = existingUser.user_id;

    // Prepare Cognito SignUp parameters
    const signUpParams: SignUpCommandInput = {
      ClientId: USER_POOL_CLIENT_ID,
      Username: email.toLowerCase(),
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email.toLowerCase(),
        },
        {
          Name: 'name',
          Value: name.trim(),
        },
      ],
    };

    // Register user in Cognito
    let cognitoUserSub: string;
    try {
      const command = new SignUpCommand(signUpParams);
      const response = await cognitoClient.send(command);
      cognitoUserSub = response.UserSub!;
    } catch (error: any) {
      console.error('Cognito registration error:', error);

      // Handle specific Cognito errors
      if (error.name === 'UsernameExistsException') {
        // The Cognito user exists but this DB row is an unclaimed invitation, so
        // SignUp can never hand us a sub. Happens routinely in local dev: `make
        // down-v` wipes Postgres while the shared dev pool keeps the user. Link
        // the existing Cognito identity instead of dead-ending on a 409.
        {
          try {
            // AdminGetUser is SigV4-signed and needs cognito-idp:AdminGetUser
            // (granted in infrastructure/aws/lambda.tf). With no AWS credentials
            // locally this throws and we fall through to the 409.
            const cognitoUser = await cognitoClient.send(
              new AdminGetUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: email.toLowerCase(),
              }),
            );
            const sub = cognitoUser.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
            if (sub && cognitoUser.UserStatus === 'CONFIRMED') {
              const linkResult = await db
                .updateTable('branch.users')
                .set({ cognito_sub: sub })
                .where('user_id', '=', claimingUserId)
                .where('cognito_sub', 'is', null)
                .executeTakeFirst();
              // A concurrent claim already took this row; do not delete the
              // pre-existing Cognito user, it may back a working account.
              if (linkResult.numUpdatedRows > 0n) {
                return json(200, {
                  message: 'Existing account linked',
                  claimed: true,
                  email: email.toLowerCase(),
                });
              }
            }
          } catch (linkError) {
            console.warn('Could not auto-link existing Cognito user:', linkError);
            reportError(linkError, { email: (email as string).toLowerCase() });
          }
        }
        return json(409, {
          message: 'User with this email already exists',
          code: 'COGNITO_USER_EXISTS',
        });
      }
      if (error.name === 'InvalidPasswordException') {
        return json(400, { message: 'Password does not meet requirements' });
      }
      if (error.name === 'InvalidParameterException') {
        return json(400, { message: error.message || 'Invalid parameters provided' });
      }

      reportError(error);
      return json(500, { message: 'Failed to register user in authentication service' });
    }

    const rollbackCognitoUser = async () => {
      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: email.toLowerCase(),
          })
        );
        console.log('Rolled back Cognito user after database failure');
      } catch (rollbackError) {
        // The Cognito user is now orphaned: no DB row, no way to sign up again.
        console.error('Failed to rollback Cognito user:', rollbackError);
        reportError(rollbackError, { email: email.toLowerCase() });
      }
    };

    // Create user in database, or claim the pending invitation
    try {
      // Claim the invitation. is_admin is deliberately NOT touched: it was set
      // by whoever created the invitation (a seed, or an admin via POST /users)
      // and must never be settable from a public, unauthenticated endpoint.
      // There is no insert path here -- registration cannot mint a new row, only
      // claim one an admin already approved. The cognito_sub IS NULL predicate
      // makes a concurrent claim a no-op rather than an overwrite;
      // UNIQUE(cognito_sub) is the backstop.
      const claimResult = await db
        .updateTable('branch.users')
        .set({ cognito_sub: cognitoUserSub, name: name.trim() })
        .where('user_id', '=', claimingUserId)
        .where('cognito_sub', 'is', null)
        .executeTakeFirst();

      // No-op claim: the Cognito sub we just created would reference no row, so
      // every later login would fail. Undo the Cognito user instead.
      if (claimResult.numUpdatedRows === 0n) {
        console.error('Invitation already claimed for user_id:', claimingUserId);
        await rollbackCognitoUser();
        return json(409, {
          message: 'User with this email already exists',
          code: 'ALREADY_CLAIMED',
        });
      }
    } catch (dbError: any) {
      console.error('Database insert error:', dbError);

      // Rollback: Delete user from Cognito if database insert fails
      await rollbackCognitoUser();

      reportError(dbError);
      return json(500, { message: 'Failed to create user account' });
    }

    return json(201, {
      message: 'User registered successfully',
      userId: cognitoUserSub,
      email: email.toLowerCase(),
      name: name.trim(),
      emailVerificationRequired: true,
      details: 'Please check your email for verification code',
      claimed: true,
    });
  } catch (error: any) {
    return serverError(error, 'Internal server error during registration');
  }
}

export async function handleVerifyEmail(event: any): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  const { email, code } = body;
  if (!email || !code) {
    return json(400, { message: 'email and code are required' });
  }
  const params: ConfirmSignUpCommandInput = {
    ClientId: USER_POOL_CLIENT_ID,
    Username: email as string,
    ConfirmationCode: code as string,
  };
  try {
    await cognitoClient.send(new ConfirmSignUpCommand(params));
  } catch (error: any) {
    console.error('Email verification error:', error);
    if (error.name === 'NotAuthorizedException' && error.message?.includes('CONFIRMED')) {
      return json(200, { message: `Email already verified for ${email}` });
    }
    if (error.name === 'CodeMismatchException' || error.name === 'ExpiredCodeException') {
      return json(400, { message: 'Invalid or expired verification code' });
    }
    if (error.name === 'UserNotFoundException') {
      return json(400, { message: 'Invalid code or email' });
    }
    if (error.name === 'LimitExceededException') {
      return json(429, { message: 'Too many attempts, please try again later' });
    }
    reportError(error);
    return json(500, { message: 'Failed to verify email' });
  }
  return json(200, { message: `Email verified successfully for ${email}` });
}

export async function handleResendCode(event: any): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  const { email } = body;
  if (!email) {
    return json(400, { message: 'email is required' });
  }
  try {
    await cognitoClient.send(new ResendConfirmationCodeCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: email as string,
    }));
    return json(200, { message: `Verification code resent to ${email}` });
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return json(404, { message: 'User not found' });
    }
    if (error.name === 'InvalidParameterException') {
      return json(400, { message: 'User is already confirmed' });
    }
    if (error.name === 'LimitExceededException') {
      return json(429, { message: 'Too many attempts, please try again later' });
    }
    return serverError(error, 'Failed to resend verification code');
  }
}
