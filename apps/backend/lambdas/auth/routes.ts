import type { Route } from '@branch/lambda-http';
import { handleRegister, handleVerifyEmail, handleResendCode } from './controllers/register';
import {
  handleLogin,
  handleRespondChallenge,
  handleRefresh,
  handleMe,
  handleLogout,
} from './controllers/auth';
import { handleForgotPassword, handleResetPassword } from './controllers/password';
import {
  handleMfaSetup,
  handleMfaVerify,
  handleMfaDisable,
  handleMfaStatus,
} from './controllers/mfa';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  // CLI-generated routes will be inserted here

  { method: 'POST', pattern: '/auth/register', handler: ({ event }) => handleRegister(event) },
  { method: 'POST', pattern: '/auth/login', handler: ({ event }) => handleLogin(event) },
  { method: 'POST', pattern: '/auth/respond-challenge', handler: ({ event }) => handleRespondChallenge(event) },
  { method: 'POST', pattern: '/auth/refresh', handler: ({ event }) => handleRefresh(event) },
  { method: 'GET', pattern: '/auth/me', handler: ({ event }) => handleMe(event) },
  { method: 'POST', pattern: '/auth/verify-email', handler: ({ event }) => handleVerifyEmail(event) },
  { method: 'POST', pattern: '/auth/resend-code', handler: ({ event }) => handleResendCode(event) },
  { method: 'POST', pattern: '/auth/logout', handler: ({ event }) => handleLogout(event) },
  { method: 'POST', pattern: '/auth/forgot-password', handler: ({ event }) => handleForgotPassword(event) },
  { method: 'POST', pattern: '/auth/reset-password', handler: ({ event }) => handleResetPassword(event) },
  { method: 'POST', pattern: '/auth/mfa-setup', handler: handleMfaSetup },
  { method: 'POST', pattern: '/auth/mfa-verify', handler: handleMfaVerify },
  { method: 'POST', pattern: '/auth/mfa-disable', handler: handleMfaDisable },
  { method: 'GET', pattern: '/auth/mfa-status', handler: handleMfaStatus },
  // <<< ROUTES-END
];
