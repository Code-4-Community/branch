import { authenticateRequest as _authenticateRequest, loadRbacSubject } from '@branch/lambda-auth';
import { createAuthResolver } from '@branch/lambda-http';
import db from './db';

export * from '@branch/lambda-auth';

export async function authenticateRequest(
  event: any,
): Promise<import('@branch/lambda-auth').AuthContext> {
  return _authenticateRequest(db, event);
}

/**
 * Handed to `dispatch`, which calls it once per request. Controllers read the
 * resulting subject off `RouteCtx.auth` — they must not authenticate again.
 */
export const resolveAuth = createAuthResolver(authenticateRequest, (context) =>
  loadRbacSubject(db, context),
);
