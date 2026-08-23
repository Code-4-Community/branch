import type { Route } from '@branch/lambda-http';
import { listUsers, getUser, patchUser, deleteUser, createUser } from './controllers/users';

/**
 * The roster is user administration (`accounts:*`, admin-only). The two
 * per-user routes are the profile page and are open to everyone for their own
 * row, which is `profile:view` / `profile:update` — record-scoped, so checked
 * in the controller against the `:userId` in the path.
 */
export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/users', permission: 'accounts:view', handler: listUsers },
  { method: 'GET', pattern: '/users/:userId', access: 'authenticated', handler: getUser },
  { method: 'PATCH', pattern: '/users/:userId', access: 'authenticated', handler: patchUser },
  { method: 'DELETE', pattern: '/users/:userId', permission: 'accounts:delete', handler: deleteUser },
  { method: 'POST', pattern: '/users', permission: 'accounts:create', handler: createUser },
  // <<< ROUTES-END
];
