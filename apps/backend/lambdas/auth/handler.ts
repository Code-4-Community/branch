import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  SignUpCommandInput,
  AdminDeleteUserCommand,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  ConfirmSignUpCommandInput,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ResendConfirmationCodeCommandInput,
  GlobalSignOutCommand,
  GlobalSignOutCommandInput,
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoUser, CognitoUserPool, AuthenticationDetails } from 'amazon-cognito-identity-js';
import db from './db';

// Initialize Cognito client (region defaults to us-east-2)
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const USER_POOL_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

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

    
    // POST /login
    if (normalizedPath === '/login' && method === 'POST') {
      return await handleLogin(event);
    }
    
    // POST /verify-email
    if (normalizedPath === '/verify-email' && method === 'POST') {
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
        return json(500, { message: 'Failed to verify email' });
      }
      return json(200, { message: `Email verified successfully for ${email}` });
    }
    
    // POST /resend-code
    if (normalizedPath === '/resend-code' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email } = body;
      if (!email) {
        return json(400, { message: 'email is required' });
      }
      const params: ResendConfirmationCodeCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: email as string,
      };
      const response = await cognitoClient.send(new ResendConfirmationCodeCommand(params));
      if (!response.CodeDeliveryDetails) {
        return json(400, { message: 'Failed to resend code' });
      }
      return json(200, { message: `Code resent successfully for ${email}, delivery details: ${response.CodeDeliveryDetails}` });
    }
    
    // POST /logout
    if (normalizedPath === '/logout' && method === 'POST') {
      const authHeader = event.headers?.authorization || event.headers?.Authorization;
      if (!authHeader) {
        return json(401, { message: 'Authorization header is required' });
      }

      // Extract token (remove "Bearer " prefix if present)
      const accessToken = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!accessToken) {
        return json(401, { message: 'Access token is required' });
      }

      const params: GlobalSignOutCommandInput = {
        AccessToken: accessToken,
      };

      try {
        await cognitoClient.send(new GlobalSignOutCommand(params));
        return json(200, { message: 'Logged out successfully' });
      } catch (error: any) {
        console.error('Logout error:', error);

        if (error.name === 'NotAuthorizedException') {
          return json(401, { message: 'Invalid or expired token' });
        }

        return json(500, { message: 'Failed to logout' });
      }
    }
    
    // POST /forgot-password
    if (normalizedPath === '/forgot-password' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email } = body;
      if (!email) {
        return json(400, { message: 'email is required' });
      }

      const params: ForgotPasswordCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: (email as string).toLowerCase(),
      };

      try {
        const response = await cognitoClient.send(new ForgotPasswordCommand(params));
        return json(200, {
          message: 'Password reset code sent',
          deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
          destination: response.CodeDeliveryDetails?.Destination,
        });
      } catch (error: any) {
        console.error('Forgot password error:', error);
        if (error.name === 'UserNotFoundException') {
          // Don't reveal whether the user exists
          return json(200, { message: 'If an account with that email exists, a reset code has been sent' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many requests, please try again later' });
        }
        if (error.name === 'InvalidParameterException') {
          return json(400, { message: 'Cannot reset password for unverified email. Please verify your email first.' });
        }
        return json(500, { message: 'Failed to initiate password reset' });
      }
    }
    
    // POST /reset-password
    if (normalizedPath === '/reset-password' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      const { email, code, newPassword } = body;
      if (!email || !code || !newPassword) {
        return json(400, { message: 'email, code, and newPassword are required' });
      }

      const params: ConfirmForgotPasswordCommandInput = {
        ClientId: USER_POOL_CLIENT_ID,
        Username: (email as string).toLowerCase(),
        ConfirmationCode: code as string,
        Password: newPassword as string,
      };

      try {
        await cognitoClient.send(new ConfirmForgotPasswordCommand(params));
        return json(200, { message: 'Password reset successfully' });
      } catch (error: any) {
        console.error('Reset password error:', error);
        if (error.name === 'CodeMismatchException') {
          return json(400, { message: 'Invalid verification code' });
        }
        if (error.name === 'ExpiredCodeException') {
          return json(400, { message: 'Verification code has expired, please request a new one' });
        }
        if (error.name === 'InvalidPasswordException') {
          return json(400, { message: 'Password does not meet requirements (min 8 chars, uppercase, lowercase, number)' });
        }
        if (error.name === 'UserNotFoundException') {
          return json(400, { message: 'Invalid email or code' });
        }
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many attempts, please try again later' });
        }
        return json(500, { message: 'Failed to reset password' });
      }
    }
    // <<< ROUTES-END       

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

async function handleLogin(event: any): Promise<APIGatewayProxyResult> {
  let body: Record<string, unknown>;
  try {
    body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  } catch (e) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { email, password } = body;
  if (!email || !password) {
    return json(400, { message: 'email and password are required' });
  }

  const userPool = new CognitoUserPool({
    UserPoolId: USER_POOL_ID,
    ClientId: USER_POOL_CLIENT_ID,
  });

  const cognitoUser = new CognitoUser({
    Username: email as string,
    Pool: userPool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email as string,
    Password: password as string,
  });

  return new Promise<APIGatewayProxyResult>((resolve) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (result) => {
        resolve(json(200, {
          AccessToken: result.getAccessToken().getJwtToken(),
          IdToken: result.getIdToken().getJwtToken(),
          RefreshToken: result.getRefreshToken().getToken(),
        }));
      },
      onFailure: (err) => {
        console.error('SRP auth error:', err);
        if (err.code === 'UserNotConfirmedException') {
          resolve(json(403, { message: 'Email not verified' }));
        } else if (err.code === 'NotAuthorizedException') {
          resolve(json(401, { message: 'Invalid email or password' }));
        } else if (err.code === 'UserNotFoundException') {
          resolve(json(401, { message: 'Invalid email or password' }));
        } else {
          resolve(json(500, { message: 'Authentication failed', error: err.message }));
        }
      },
      newPasswordRequired: (userAttributes) => {
        resolve(json(403, { message: 'Password change required', userAttributes }));
      },
    });
  });
}

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
