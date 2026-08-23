import { json, createAuthGuard, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { authenticateRequest, canAccessProject, canListAssignableStaff } from '../auth';

const guard = createAuthGuard(authenticateRequest);

// GET /projects/{id}/members
export const getMembers: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
  if (!(await canAccessProject(user!.userId!, Number(id)))) {
    return json(403, { message: 'You do not have access to this project' });
  }
  const users = await db
    .selectFrom('branch.project_memberships as pm')
    .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
    .select([
      'u.user_id',
      'u.name',
      'u.email',
      'pm.role'
    ])
    .where('pm.project_id', '=', Number(id))
    .execute();
  return json(200, {
    ok: true, route: 'GET /projects/{id}/members', pathParams: { id }, body: {
      users
    }
  });
};

// GET /projects/assignable-staff
export const getAssignableStaff: RouteHandler = async ({ event }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  if (!(await canListAssignableStaff(user!.userId!))) {
    return json(403, { message: 'You do not have access to assign staff' });
  }
  const staff = await db
    .selectFrom('branch.users')
    .select(['user_id', 'name', 'email', 'profile_image'])
    .orderBy('name', 'asc')
    .execute();
  return json(200, { staff });
};
