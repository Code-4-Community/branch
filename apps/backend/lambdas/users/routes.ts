import type { Route } from '@branch/lambda-http';
import {
  listUsers,
  getUser,
  getPhotoUploadUrl,
  patchUser,
  deleteUser,
  createUser,
} from './controllers/users';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/users', handler: listUsers },
  { method: 'GET', pattern: '/users/:userId', handler: getUser },
  { method: 'GET', pattern: '/users/:userId/photo-upload-url', handler: getPhotoUploadUrl },
  { method: 'PATCH', pattern: '/users/:userId', handler: patchUser },
  { method: 'DELETE', pattern: '/users/:userId', handler: deleteUser },
  { method: 'POST', pattern: '/users', handler: createUser },
  // <<< ROUTES-END
];
