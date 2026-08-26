import { APIGatewayProxyResult } from 'aws-lambda';
import {
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { json, reportError } from '@branch/lambda-http';
import { cognitoClient, USER_POOL_CLIENT_ID } from '../services/cognito';

export async function handleForgotPassword(event: any): Promise<APIGatewayProxyResult> {
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
    reportError(error);
    return json(500, { message: 'Failed to initiate password reset' });
  }
}

export async function handleResetPassword(event: any): Promise<APIGatewayProxyResult> {
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
    reportError(error);
    return json(500, { message: 'Failed to reset password' });
  }
}
