import { json, parseBody, requirePermission, RouteHandler } from '@branch/lambda-http';
import { projectScopeIds } from '@branch/rbac';
import { sql, type SqlBool } from 'kysely';
import db from '../db';
import { ProjectValidationUtils } from '../validation-utils';
import { requireVisibleProject } from './project-guard';
import {
  ADMIN_ASSIGNMENT_MESSAGE,
  deleteProjectObjects,
  findAdminUserIds,
  findUnknownUserIds,
  isProjectActive,
  loadAdminHeadcount,
  loadProjectAggregates,
  syncMemberships,
  toIsoDate,
} from '../services/projects';

// Authentication and each route's declared permission are enforced by dispatch
// before these run — see routes.ts. `project:create`, `project:update` and
// `project:delete` are all settled there; what remains here is the per-record
// visibility check, which needs the id.

// GET /projects
export const listProjects: RouteHandler = async ({ auth }) => {
  // Scoped in SQL rather than by fetching everything and filtering: a non-admin
  // must never receive a row for a project they are not on, not even to drop it.
  // `= ANY($1)` and not `IN ($1, ..., $n)`: one bound array is one entry in the
  // plan cache whatever the caller's project count.
  const scope = projectScopeIds(auth.subject);

  let query = db.selectFrom('branch.projects').selectAll().orderBy('project_id', 'asc');
  if (scope) query = query.where(sql<SqlBool>`project_id = ANY(${scope})`);
  const projects = await query.execute();

  // The list cards render "spent / budget", a member count and an
  // active-vs-archived split. Serving those aggregates here keeps the page
  // to one request instead of three per project.
  const projectIds = projects.map((p) => p.project_id);
  const [{ spent, members }, { admins, storedAdmins }] = await Promise.all([
    loadProjectAggregates(projectIds),
    loadAdminHeadcount(projectIds),
  ]);

  return json(
    200,
    projects.map((p) => ({
      ...p,
      total_spent: spent.get(p.project_id) ?? 0,
      member_count:
        (members.get(p.project_id) ?? 0) - (storedAdmins.get(p.project_id) ?? 0) + admins,
      is_active: isProjectActive(p.end_date),
    })),
  );
};

// GET /projects/{id}
export const getProject: RouteHandler = async (ctx) => {
  const { projectId, response } = requireVisibleProject(ctx);
  if (response) return response;

  const project = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .selectAll()
    .executeTakeFirst();
  if (!project) return json(404, { message: `Project not found for id: ${projectId}` });
  return json(200, project);
};

// PUT /projects/{id} — admin-only via `project:update` on the route.
export const updateProject: RouteHandler = async ({ event, params, auth }) => {
  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });

  const body = parseBody(event);
  if (body === null) return json(400, { message: 'Invalid JSON in request body' });

  const result = ProjectValidationUtils.buildUpdateValues(body);
  if (!result.isValid) return json(400, { message: result.error });
  const updateValues = result.values!;

  const membersResult = ProjectValidationUtils.validateMembers(body.members);
  if (!membersResult.isValid) return json(400, { message: membersResult.error });
  const members = membersResult.value;

  // Editing the roster is its own permission, checked only when the request
  // actually carries one. `project:update` on the route is admin-only today, so
  // this changes nothing yet; it means the matrix row is enforced rather than
  // implied, and stays enforced if project editing ever widens.
  if (members !== undefined) {
    const denied = requirePermission(auth.subject, 'project:manageMembers');
    if (denied) return denied;
  }

  if (Object.keys(updateValues).length === 0 && members === undefined) {
    return json(400, { message: 'No valid fields provided' });
  }

  const existing = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', Number(id))
    .select(['start_date', 'end_date'])
    .executeTakeFirst();
  if (!existing) return json(404, { message: `Project not found for id: ${id}` });

  // The edit form can set a start date and clear the end date in the same
  // submit, so the range is checked against the merged row rather than the
  // patch — validating the patch alone would miss a start date moved past
  // an end date that the request never mentions.
  const nextStart = 'start_date' in updateValues
    ? (updateValues.start_date as string | null)
    : toIsoDate(existing.start_date);
  const nextEnd = 'end_date' in updateValues
    ? (updateValues.end_date as string | null)
    : toIsoDate(existing.end_date);

  const rangeResult = ProjectValidationUtils.validateDateRange(nextStart, nextEnd);
  if (!rangeResult.isValid) return json(400, { message: rangeResult.error });

  if (members !== undefined) {
    const unknownIds = await findUnknownUserIds(members);
    if (unknownIds.length > 0) {
      return json(400, { message: `Unknown user ids: ${unknownIds.join(', ')}` });
    }
    const adminIds = await findAdminUserIds(members);
    if (adminIds.length > 0) {
      return json(400, { message: ADMIN_ASSIGNMENT_MESSAGE });
    }
  }

  try {
    // Field update and roster replacement share a transaction: a failed
    // membership insert must not leave the project with nobody assigned.
    const updatedProject = await db.transaction().execute(async (trx) => {
      const row = Object.keys(updateValues).length > 0
        ? await trx
            .updateTable('branch.projects')
            .set(updateValues)
            .where('project_id', '=', Number(id))
            .returningAll()
            .executeTakeFirst()
        : await trx
            .selectFrom('branch.projects')
            .where('project_id', '=', Number(id))
            .selectAll()
            .executeTakeFirst();

      if (!row) return undefined;
      if (members !== undefined) await syncMemberships(trx, Number(id), members);
      return row;
    });

    if (!updatedProject) return json(404, { message: `Project not found for id: ${id}` });
    return json(200, updatedProject);
  } catch (e) {
    console.error('Project update failed', e);
    return json(500, { message: 'Failed to update project' });
  }
};

// DELETE /projects/{id} — admin-only via `project:delete` on the route.
export const deleteProject: RouteHandler = async ({ params }) => {
  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'id must be a valid number' });

  const deleted = await db.deleteFrom('branch.projects').where('project_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Project not found' });
  }

  // The expenditure and report rows went with the project via ON DELETE
  // CASCADE, so nothing is left to tell us which files they owned. Both
  // services key their objects by project id, so clear those prefixes —
  // otherwise every receipt and report for the project is orphaned at once,
  // which is the single largest source of unreferenced objects.
  const filesDeleted = await deleteProjectObjects(Number(id));

  return json(200, { ok: true, route: 'DELETE /projects/{projectId}', pathParams: { id }, filesDeleted });
};

// POST /projects — admin-only via `project:create` on the route.
export const createProject: RouteHandler = async ({ event, auth }) => {
  const body = parseBody(event);
  if (body === null) return json(400, { message: 'Invalid JSON in request body' });

  const nameResult = ProjectValidationUtils.validateName(body.name);
  if (!nameResult.isValid) {
    return json(400, { message: nameResult.error });
  }

  const values: any = { name: nameResult.value };

  const parsedBudget = ProjectValidationUtils.parseNumericToFixed(body.total_budget);
  if (parsedBudget === 'INVALID') return json(400, { message: "'total_budget' must be a number" });
  if (parsedBudget !== null) values.total_budget = parsedBudget;

  const startDateResult = ProjectValidationUtils.validateDate(body.start_date, 'start_date');
  if (!startDateResult.isValid) return json(400, { message: startDateResult.error });
  if (startDateResult.value !== null) values.start_date = startDateResult.value;

  const endDateResult = ProjectValidationUtils.validateDate(body.end_date, 'end_date');
  if (!endDateResult.isValid) return json(400, { message: endDateResult.error });
  if (endDateResult.value !== null) values.end_date = endDateResult.value;

  const currencyResult = ProjectValidationUtils.validateCurrency(body.currency);
  if (!currencyResult.isValid) return json(400, { message: currencyResult.error });
  if (currencyResult.value !== null) values.currency = currencyResult.value;

  const descriptionResult = ProjectValidationUtils.validateDescription(body.description);
  if (!descriptionResult.isValid) return json(400, { message: descriptionResult.error });
  values.description = descriptionResult.value;

  const rangeResult = ProjectValidationUtils.validateDateRange(
    startDateResult.value,
    endDateResult.value,
  );
  if (!rangeResult.isValid) return json(400, { message: rangeResult.error });

  const membersResult = ProjectValidationUtils.validateMembers(body.members);
  if (!membersResult.isValid) return json(400, { message: membersResult.error });
  const members = membersResult.value ?? [];

  if (members.length > 0) {
    const denied = requirePermission(auth.subject, 'project:manageMembers');
    if (denied) return denied;
  }

  const unknownIds = await findUnknownUserIds(members);
  if (unknownIds.length > 0) {
    return json(400, { message: `Unknown user ids: ${unknownIds.join(', ')}` });
  }
  const adminIds = await findAdminUserIds(members);
  if (adminIds.length > 0) {
    return json(400, { message: ADMIN_ASSIGNMENT_MESSAGE });
  }

  try {
    // Creating the project and its roster together: a project that saved
    // without its staff would look complete but fail the form's own
    // "at least one staff member" rule on the next read.
    const inserted = await db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('branch.projects')
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();

      if (members.length > 0) await syncMemberships(trx, row.project_id, members);
      return row;
    });

    return json(201, inserted);
  } catch (e) {
    console.error('DB insert failed', e);
    return json(500, { message: 'Failed to create project' });
  }
};
