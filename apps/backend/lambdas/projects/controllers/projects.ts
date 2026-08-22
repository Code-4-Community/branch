import { json, parseBody, createAuthGuard, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { ProjectValidationUtils } from '../validation-utils';
import {
  authenticateRequest,
  canAccessProject,
  canCreateProject,
  canDeleteProject,
  canEditProject,
} from '../auth';
import {
  findUnknownUserIds,
  isProjectActive,
  loadProjectAggregates,
  syncMemberships,
  toIsoDate,
} from '../services/projects';

const guard = createAuthGuard(authenticateRequest);

// GET /projects
export const listProjects: RouteHandler = async ({ event }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const projects = user!.isAdmin
    ? await db.selectFrom("branch.projects").selectAll().orderBy('project_id', 'asc').execute()
    : await db
        .selectFrom("branch.projects as p")
        .innerJoin("branch.project_memberships as pm", "pm.project_id", "p.project_id")
        .where("pm.user_id", "=", user!.userId!)
        .selectAll("p")
        .orderBy('p.project_id', 'asc')
        .execute();

  // The list cards render "spent / budget", a member count and an
  // active-vs-archived split. Serving those aggregates here keeps the page
  // to one request instead of three per project.
  const { spent, members } = await loadProjectAggregates(projects.map((p) => p.project_id));

  return json(
    200,
    projects.map((p) => ({
      ...p,
      total_spent: spent.get(p.project_id) ?? 0,
      member_count: members.get(p.project_id) ?? 0,
      is_active: isProjectActive(p.end_date),
    })),
  );
};

// GET /projects/{id}
export const getProject: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
  if (!(await canAccessProject(user!.userId!, Number(id)))) {
    return json(403, { message: 'You do not have access to this project' });
  }
  const project = await db.selectFrom("branch.projects").where("project_id", "=", Number(id)).selectAll().executeTakeFirst();
  if (!project) return json(404, { message: `Project not found for id: ${id}` });
  return json(200, project);
};

// PUT /projects/{id}
export const updateProject: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
  if (!(await canEditProject(user!.userId!, Number(id)))) {
    return json(403, { message: 'You do not have access to edit this project' });
  }
  const body = parseBody(event);
  if (body === null) return json(400, { message: 'Invalid JSON in request body' });

  const result = ProjectValidationUtils.buildUpdateValues(body);
  if (!result.isValid) return json(400, { message: result.error });
  const updateValues = result.values!;

  const membersResult = ProjectValidationUtils.validateMembers(body.members);
  if (!membersResult.isValid) return json(400, { message: membersResult.error });
  const members = membersResult.value;

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

// DELETE /projects/{id}
export const deleteProject: RouteHandler = async ({ event, params }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  const id = params.id;
  if (!id) return json(400, { message: 'id is required' });
  if (!/^\d+$/.test(id)) return json(400, { message: 'id must be a valid number' });

  // The gate at the top of this handler establishes authentication but not
  // authorization; this route previously had neither check, so any
  // authenticated user could delete any project.
  if (!(await canDeleteProject(user!.userId!))) {
    return json(403, { message: 'Admin access required' });
  }

  const deleted = await db.deleteFrom('branch.projects').where('project_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Project not found' });
  }

  return json(200, { ok: true, route: 'DELETE /projects/{projectId}', pathParams: { id } });
};

// POST /projects
export const createProject: RouteHandler = async ({ event }) => {
  const { ctx, response } = await guard(event, 'AUTHENTICATED');
  if (response) return response;
  const { user } = ctx;

  if (!(await canCreateProject(user!.userId!))) {
    return json(403, { message: 'Admin access required' });
  }
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

  const unknownIds = await findUnknownUserIds(members);
  if (unknownIds.length > 0) {
    return json(400, { message: `Unknown user ids: ${unknownIds.join(', ')}` });
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
