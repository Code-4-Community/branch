import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  SignUpCommandInput,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import db from './db';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const USER_POOL_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

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
    
    // POST /register
    if (normalizedPath === '/register' && method === 'POST') {
      return await handleRegister(event);
    }
    // <<< ROUTES-END 

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

async function handleRegister(event: any): Promise<APIGatewayProxyResult> {
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
    if (password.length < 8) {
      return json(400, { message: 'Password must be at least 8 characters long' });
    }
    if (!/[a-z]/.test(password)) {
      return json(400, { message: 'Password must contain at least one lowercase letter' });
    }
    if (!/[A-Z]/.test(password)) {
      return json(400, { message: 'Password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return json(400, { message: 'Password must contain at least one number' });
    }

    // Validate name
    if (name.trim().length < 2) {
      return json(400, { message: 'Name must be at least 2 characters long' });
    }

    // Check if user already exists in database
    const existingUser = await db
      .selectFrom('branch.users')
      .where('email', '=', email.toLowerCase())
      .selectAll()
      .executeTakeFirst();

    if (existingUser) {
      return json(409, { message: 'User with this email already exists' });
    }

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
        return json(409, { message: 'User with this email already exists' });
      }
      if (error.name === 'InvalidPasswordException') {
        return json(400, { message: 'Password does not meet requirements' });
      }
      if (error.name === 'InvalidParameterException') {
        return json(400, { message: error.message || 'Invalid parameters provided' });
      }

      return json(500, { message: 'Failed to register user in authentication service' });
    }

    // Create user in database
    try {
      await db
        .insertInto('branch.users')
        .values({
          cognito_sub: cognitoUserSub,
          email: email.toLowerCase(),
          name: name.trim(),
          is_admin: false,
        })
        .execute();
    } catch (dbError: any) {
      console.error('Database insert error:', dbError);

      // Rollback: Delete user from Cognito if database insert fails
      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID || '',
            Username: email.toLowerCase(),
          })
        );
        console.log('Rolled back Cognito user after database failure');
      } catch (rollbackError) {
        console.error('Failed to rollback Cognito user:', rollbackError);
      }

      return json(500, { message: 'Failed to create user account' });
    }

    return json(201, {
      message: 'User registered successfully',
      userId: cognitoUserSub,
      email: email.toLowerCase(),
      name: name.trim(),
      emailVerificationRequired: true,
      details: 'Please check your email for verification code',
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return json(500, { message: 'Internal server error during registration' });
  }
}

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
