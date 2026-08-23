import { json, createAuthGuard, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { authenticateRequest, canAccessProject } from '../auth';

const guard = createAuthGuard(authenticateRequest);

// GET /projects/{id}/donors
export const getProjectDonors: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;

  if (!id) return json(400, { message: 'id is required' });
  if (isNaN(Number(id))) {
    return json(400, { message: 'Project id must be a valid number' });
  }
  if (!(await canAccessProject(user!.userId!, Number(id)))) {
    return json(403, { message: 'You do not have access to this project' });
  }
  const queryString = event.rawQueryString || event.queryStringParameters;

  if (queryString && (typeof queryString === 'string' ? queryString.length > 0 : Object.keys(queryString).length > 0)) {
    return json(400, { message: 'Bad Request: Query parameters are not allowed' });
  }

  const project = await db
    .selectFrom("branch.projects as p")
    .where("p.project_id", "=", Number(id))
    .selectAll()
    .executeTakeFirst();

  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  const donors = await db.selectFrom("branch.projects as p").where("p.project_id", "=", Number(id)).innerJoin(
    "branch.project_donations as bpd",
    "bpd.project_id",
    "p.project_id"
  ).innerJoin(
    "branch.donors as bd",
    "bd.donor_id",
    "bpd.donor_id"
  ).select(['bd.donor_id', 'bd.organization', 'bd.contact_name', 'bd.contact_email', 'bpd.donation_id', 'bpd.amount', 'bpd.donated_at']).execute();
  return json(200, { donors });
};
