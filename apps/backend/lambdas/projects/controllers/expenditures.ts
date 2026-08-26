import { json, RouteHandler, serverError } from '@branch/lambda-http';
import { can } from '@branch/rbac';
import db from '../db';
import { requireVisibleProject } from './project-guard';

// GET /projects/{id}/expenditures
export const getProjectExpenditures: RouteHandler = async (ctx) => {
  const { projectId, response } = requireVisibleProject(ctx);
  if (response) return response;

  try {
    const project = await db
      .selectFrom('branch.projects')
      .where('project_id', '=', projectId)
      .selectAll()
      .executeTakeFirst();

    if (!project) {
      return json(404, { message: 'Project not found' });
    }

    const expenditures = await db
      .selectFrom('branch.expenditures')
      .where('project_id', '=', projectId)
      .selectAll()
      .orderBy('spent_on', 'desc')
      .execute();

    // Same redaction as GET /expenditures — reviewer notes are admin-only and
    // this route returns the identical rows.
    if (can(ctx.auth.subject, 'expense:viewAdminNotes')) return json(200, expenditures);
    return json(
      200,
      expenditures.map(({ admin_notes: _adminNotes, ...rest }) => rest),
    );
  } catch (err) {
    return serverError(err, 'Failed to fetch expenditures', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
