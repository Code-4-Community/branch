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

/**
 * The only service with `access: 'public'` routes — everything a caller needs
 * before they have a session. Anything reachable only once signed in is
 * `access: 'authenticated'`: these routes act on the caller's own Cognito
 * session, which is self-scoping, so there is no permission to attach.
 */
export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  // CLI-generated routes will be inserted here

  { method: 'POST', pattern: '/auth/register', access: 'public', handler: ({ event }) => handleRegister(event) },
  { method: 'POST', pattern: '/auth/login', access: 'public', handler: ({ event }) => handleLogin(event) },
  { method: 'POST', pattern: '/auth/respond-challenge', access: 'public', handler: ({ event }) => handleRespondChallenge(event) },
  { method: 'POST', pattern: '/auth/refresh', access: 'public', handler: ({ event }) => handleRefresh(event) },
  { method: 'GET', pattern: '/auth/me', access: 'authenticated', handler: handleMe },
  { method: 'POST', pattern: '/auth/verify-email', access: 'public', handler: ({ event }) => handleVerifyEmail(event) },
  { method: 'POST', pattern: '/auth/resend-code', access: 'public', handler: ({ event }) => handleResendCode(event) },
  // Public because it must still clear a session whose access token has already
  // expired; the handler validates the token it is given.
  { method: 'POST', pattern: '/auth/logout', access: 'public', handler: ({ event }) => handleLogout(event) },
  { method: 'POST', pattern: '/auth/forgot-password', access: 'public', handler: ({ event }) => handleForgotPassword(event) },
  { method: 'POST', pattern: '/auth/reset-password', access: 'public', handler: ({ event }) => handleResetPassword(event) },
  { method: 'POST', pattern: '/auth/mfa-setup', access: 'authenticated', handler: handleMfaSetup },
  { method: 'POST', pattern: '/auth/mfa-verify', access: 'authenticated', handler: handleMfaVerify },
  { method: 'POST', pattern: '/auth/mfa-disable', access: 'authenticated', handler: handleMfaDisable },
  { method: 'GET', pattern: '/auth/mfa-status', access: 'authenticated', handler: handleMfaStatus },
  // <<< ROUTES-END
];
