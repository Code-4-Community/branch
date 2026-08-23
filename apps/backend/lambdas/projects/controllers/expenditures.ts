import { json, createAuthGuard, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { authenticateRequest, canAccessProject } from '../auth';

const guard = createAuthGuard(authenticateRequest);

// GET /projects/{id}/expenditures
export const getProjectExpenditures: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });

  if (!(await canAccessProject(user!.userId!, Number(id)))) {
    return json(403, { message: 'You do not have access to this project' });
  }

  try {
    const project = await db
      .selectFrom('branch.projects')
      .where('project_id', '=', Number(id))
      .selectAll()
      .executeTakeFirst();

    if (!project) {
      return json(404, { message: 'Project not found' });
    }

    const expenditures = await db
      .selectFrom('branch.expenditures')
      .where('project_id', '=', Number(id))
      .selectAll()
      .orderBy('spent_on', 'desc')
      .execute();

    return json(200, expenditures);
  } catch (err) {
    console.error('Database error:', err);
    return json(500, { message: 'Failed to fetch expenditures', error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
