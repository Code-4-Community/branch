import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ConfirmSignUpCommand,
  ConfirmSignUpCommandInput,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand,
  GlobalSignOutCommandInput,
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import db from './db';

// Initialize Cognito client (region defaults to us-east-2)
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const USER_POOL_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const fullPath = event.rawPath || event.path || '/';
    // API Gateway mounts this service at /auth[/{proxy+}]; strip the mount
    // prefix so routing below (rawPath and normalizedPath) sees the bare path.
    const rawPath = fullPath.replace(/^\/auth(?=\/|$)/, '') || '/';
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

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    
    // POST /register — disabled: accounts are created by admins only
    if (normalizedPath === '/register' && method === 'POST') {
      return json(410, { message: 'Self-registration is not available. Contact an administrator to create an account.' });
    }

    // POST /login
    if (normalizedPath === '/login' && method === 'POST') {
      return await handleLogin(event);
    }

    // POST /set-password — complete NEW_PASSWORD_REQUIRED challenge for invited users
    if (normalizedPath === '/set-password' && method === 'POST') {
      return await handleSetPassword(event);
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
        if (error.name === 'LimitExceededException') {
          return json(429, { message: 'Too many attempts, please try again later' });
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
        console.error('Resend code error:', error);
        return json(500, { message: 'Failed to resend verification code' });
      }
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

  try {
    const response = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: (email as string).toLowerCase(),
        PASSWORD: password as string,
      },
    }));

    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return json(200, {
        challengeName: 'NEW_PASSWORD_REQUIRED',
        session: response.Session,
        email: (email as string).toLowerCase(),
      });
    }

    return json(200, {
      AccessToken: response.AuthenticationResult!.AccessToken,
      IdToken: response.AuthenticationResult!.IdToken,
      RefreshToken: response.AuthenticationResult!.RefreshToken,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    if (err.name === 'NotAuthorizedException' || err.name === 'UserNotFoundException') {
      return json(401, { message: 'Invalid email or password' });
    }
    if (err.name === 'UserNotConfirmedException') {
      return json(403, { message: 'Email not verified' });
    }
    return json(500, { message: 'Authentication failed' });
  }
}

async function handleSetPassword(event: any): Promise<APIGatewayProxyResult> {
  let body: Record<string, unknown>;
  try {
    body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  } catch (e) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { email, session, newPassword } = body;
  if (!email || !session || !newPassword) {
    return json(400, { message: 'email, session, and newPassword are required' });
  }

  const pwd = newPassword as string;
  if (
    pwd.length < 8 ||
    !/[a-z]/.test(pwd) ||
    !/[A-Z]/.test(pwd) ||
    !/[0-9]/.test(pwd)
  ) {
    return json(400, { message: 'Password must be at least 8 characters and include uppercase, lowercase, and a number' });
  }

  try {
    const response = await cognitoClient.send(new RespondToAuthChallengeCommand({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: USER_POOL_CLIENT_ID,
      Session: session as string,
      ChallengeResponses: {
        USERNAME: (email as string).toLowerCase(),
        NEW_PASSWORD: pwd,
      },
    }));

    return json(200, {
      AccessToken: response.AuthenticationResult!.AccessToken,
      IdToken: response.AuthenticationResult!.IdToken,
      RefreshToken: response.AuthenticationResult!.RefreshToken,
    });
  } catch (err: any) {
    console.error('Set password error:', err);
    if (err.name === 'InvalidPasswordException') {
      return json(400, { message: 'Password does not meet requirements (min 8 chars, uppercase, lowercase, number)' });
    }
    if (err.name === 'ExpiredCodeException' || err.name === 'NotAuthorizedException') {
      return json(401, { message: 'Session expired. Please log in again.' });
    }
    return json(500, { message: 'Failed to set password' });
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
