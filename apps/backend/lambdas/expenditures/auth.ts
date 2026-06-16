import { authenticateRequest as _authenticateRequest } from '@branch/lambda-auth';
import db from './db';

export * from '@branch/lambda-auth';

export async function authenticateRequest(
  event: any,
): Promise<import('@branch/lambda-auth').AuthContext> {
  return _authenticateRequest(db, event);
}
