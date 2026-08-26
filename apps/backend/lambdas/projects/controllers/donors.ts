import { json, RouteHandler } from '@branch/lambda-http';
import { can } from '@branch/rbac';
import db from '../db';
import { requireVisibleProject } from './project-guard';

// GET /projects/{id}/donors
export const getProjectDonors: RouteHandler = async (ctx) => {
  const { projectId, response } = requireVisibleProject(ctx);
  if (response) return response;

  const { event } = ctx;
  const queryString = event.rawQueryString || event.queryStringParameters;

  if (queryString && (typeof queryString === 'string' ? queryString.length > 0 : Object.keys(queryString).length > 0)) {
    return json(400, { message: 'Bad Request: Query parameters are not allowed' });
  }

  const project = await db
    .selectFrom('branch.projects as p')
    .where('p.project_id', '=', projectId)
    .selectAll()
    .executeTakeFirst();

  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  // Reachable by any member of the project — a member may see who funds their
  // own work. The contact details are the roster's, though, and that is
  // `donors:view` (admin and director), so they are selected only for a caller
  // who could have read them from GET /donors anyway.
  const seesContactDetails = can(ctx.auth.subject, 'donors:view');

  const donors = await db
    .selectFrom('branch.projects as p')
    .where('p.project_id', '=', projectId)
    .innerJoin('branch.project_donations as bpd', 'bpd.project_id', 'p.project_id')
    .innerJoin('branch.donors as bd', 'bd.donor_id', 'bpd.donor_id')
    .select([
      'bd.donor_id',
      'bd.organization',
      'bpd.donation_id',
      'bpd.amount',
      'bpd.donated_at',
    ])
    .$if(seesContactDetails, (qb) => qb.select(['bd.contact_name', 'bd.contact_email']))
    .execute();

  return json(200, { donors });
};
