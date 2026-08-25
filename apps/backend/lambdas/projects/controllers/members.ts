import { json, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { listRoster } from '../services/projects';
import { requireVisibleProject } from './project-guard';

// Authentication and each route's declared permission are enforced by dispatch
// before these run — see routes.ts.

// GET /projects/{id}/members
export const getMembers: RouteHandler = async (ctx) => {
  const { projectId, response } = requireVisibleProject(ctx);
  if (response) return response;

  const users = await listRoster(projectId);

  return json(200, {
    ok: true,
    route: 'GET /projects/{id}/members',
    pathParams: { id: String(projectId) },
    body: { users },
  });
};

// GET /projects/assignable-staff
// `staff:list` on the route makes this admin-only. It was open to Directors
// while they could still edit a project; they no longer can, so the roster
// closed with it.
export const getAssignableStaff: RouteHandler = async () => {
  const staff = await db
    .selectFrom('branch.users')
    .select(['user_id', 'name', 'email', 'profile_image'])
    .where('is_admin', 'is not', true)
    .orderBy('name', 'asc')
    .execute();
  return json(200, { staff });
};
