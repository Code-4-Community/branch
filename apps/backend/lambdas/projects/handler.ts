import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sql, Transaction } from 'kysely';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { DB } from '@branch/types';
import db from './db';
import {
  APPROVED_EXPENDITURE_STATUS,
  MemberAssignment,
  ProjectValidationUtils,
} from './validation-utils';
import {
  authenticateRequest,
  canAccessProject,
  canCreateProject,
  canDeleteProject,
  canEditProject,
  canListAssignableStaff,
} from './auth';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });

/** Deletes every object under one prefix, following pagination. */
async function deletePrefix(bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  let ContinuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));

    if (keys.length > 0) {
      // DeleteObjects caps at 1000 keys, which is also ListObjectsV2's page
      // size, so one page maps to one delete call.
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      removed += keys.length;
    }

    // Only follow the cursor while truncated; IsTruncated false ends the loop.
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return removed;
}

/**
 * Best-effort cleanup of the files a deleted project owned.
 *
 * Deliberately never throws: the project is already gone by the time this runs,
 * and a delete that succeeded must not be reported as a 500 because S3 was
 * unreachable or the role is missing `s3:DeleteObject`. Leftover objects are
 * recoverable; a project that cannot be deleted is not.
 */
async function deleteProjectObjects(projectId: number): Promise<number | null> {
  // Read at call time rather than at module load: the value is then observable
  // to callers that set it after import, which is what the unit tests do.
  const bucket = process.env.REPORTS_BUCKET_NAME ?? '';
  if (!bucket) {
    console.error('REPORTS_BUCKET_NAME is not set; leaving files for project', projectId);
    return null;
  }
  try {
    const counts = await Promise.all([
      deletePrefix(bucket, `receipts/${projectId}/`),
      deletePrefix(bucket, `reports/${projectId}/`),
    ]);
    return counts[0] + counts[1];
  } catch (err) {
    console.error('Failed to delete objects for project', projectId, err);
    return null;
  }
}

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const fullPath = event.rawPath || event.path || '/';
    // API Gateway mounts this service at /projects[/{proxy+}]; strip the mount
    // prefix so routing below (rawPath and normalizedPath) sees the bare path.
    const rawPath = fullPath.replace(/^\/projects(?=\/|$)/, '') || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return json(200, {});
    }

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    const authContext = await authenticateRequest(event);
    if (!authContext.isAuthenticated || !authContext.user) {
      return json(401, { message: 'Authentication required' });
    }
    const { user } = authContext;

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    // GET /dashboard
    if ((normalizedPath === '/dashboard' || normalizedPath.endsWith('/dashboard')) && method === 'GET') {
      if (!user.isAdmin) {
        return json(403, { message: 'Admin access required' });
      }

      try {
        // Cards read "this year" / "active projects", so spend is scoped to the
        // calendar year and the count to projects that have not ended. The
        // per-project budget breakdown below stays lifetime-to-date.
        const now = new Date();
        const year = now.getUTCFullYear();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const today = now.toISOString().slice(0, 10);

        // Projects stay active until their end_date passes; a null end_date
        // never ends. Shared by the count and by the spend feeding the average
        // so the two can never drift out of agreement.
        const isActive = (column: any) => (eb: any) =>
          eb.or([eb(column, 'is', null), eb(column, '>=', today as any)]);

        // Postgres does the month bucketing. Selecting raw rows and grouping them
        // in JS moved one row per expenditure into the lambda to produce at most
        // 12 x categories of them, and read a DATE through the runtime's local
        // timezone, which only lands on the right month because lambda runs UTC.
        const monthExpr = sql<string>`to_char(date_trunc('month', spent_on), 'YYYY-MM')`;

        const [
          totalSpentRow,
          totalProjectsRow,
          topCategoryRow,
          activeSpentRow,
          projectRows,
          monthRows,
        ] = await Promise.all([
          db.selectFrom('branch.expenditures')
            .select(db.fn.sum('amount').as('total'))
            .where('status', '=', APPROVED_EXPENDITURE_STATUS)
            .where('spent_on', '>=', yearStart as any)
            .where('spent_on', '<=', yearEnd as any)
            .executeTakeFirst(),
          db.selectFrom('branch.projects')
            .select(db.fn.count('project_id').as('count'))
            .where(isActive('end_date'))
            .executeTakeFirst(),
          db.selectFrom('branch.expenditures')
            .select(['category', db.fn.sum('amount').as('total')])
            .where('status', '=', APPROVED_EXPENDITURE_STATUS)
            .where('category', 'is not', null)
            .where('spent_on', '>=', yearStart as any)
            .where('spent_on', '<=', yearEnd as any)
            .groupBy('category')
            .orderBy(db.fn.sum('amount'), 'desc')
            .limit(1)
            .executeTakeFirst(),
          // Numerator for the average: this year's spend on the very projects the
          // denominator counts. expenditures.project_id is NOT NULL against a FK,
          // so the join can never drop a row.
          db.selectFrom('branch.expenditures as e')
            .innerJoin('branch.projects as p', 'p.project_id', 'e.project_id')
            .select((eb) => eb.fn.sum('e.amount').as('total'))
            .where('e.status', '=', APPROVED_EXPENDITURE_STATUS)
            .where('e.spent_on', '>=', yearStart as any)
            .where('e.spent_on', '<=', yearEnd as any)
            .where(isActive('p.end_date'))
            .executeTakeFirst(),
          // Spend and headcount arrive as pre-aggregated subqueries. Joining the
          // raw tables onto projects instead would multiply every expenditure by
          // the membership count and silently inflate `spent`.
          db.selectFrom('branch.projects as p')
            .leftJoin(
              (eb) =>
                eb.selectFrom('branch.expenditures')
                  .select('project_id')
                  .select((sub) => sub.fn.sum('amount').as('total'))
                  .where('status', '=', APPROVED_EXPENDITURE_STATUS)
                  .groupBy('project_id')
                  .as('spend'),
              (join) => join.onRef('spend.project_id', '=', 'p.project_id'),
            )
            .leftJoin(
              (eb) =>
                eb.selectFrom('branch.project_memberships')
                  .select('project_id')
                  .select((sub) => sub.fn.count('user_id').as('count'))
                  .groupBy('project_id')
                  .as('staff'),
              (join) => join.onRef('staff.project_id', '=', 'p.project_id'),
            )
            .select([
              'p.project_id',
              'p.name',
              'p.total_budget',
              'p.currency',
              'spend.total as spent',
              'staff.count as staff_count',
            ])
            .orderBy('p.project_id', 'asc')
            .execute(),
          db.selectFrom('branch.expenditures')
            .select([monthExpr.as('month'), 'category', db.fn.sum('amount').as('total')])
            .where('status', '=', APPROVED_EXPENDITURE_STATUS)
            .where('category', 'is not', null)
            .where('spent_on', '>=', yearStart as any)
            .where('spent_on', '<=', yearEnd as any)
            .groupBy([monthExpr, 'category'])
            .orderBy(monthExpr)
            .orderBy('category')
            .execute(),
        ]);

        const totalSpent = Number(totalSpentRow?.total ?? 0);
        const totalProjects = Number(totalProjectsRow?.count ?? 0);

        // True aggregate over active projects: this year's spend on active
        // projects divided by how many there are. Dividing the all-projects total
        // by the active count inflated the figure whenever a project ended
        // mid-year, since its spend stayed in the numerator.
        const activeSpent = Number(activeSpentRow?.total ?? 0);
        const averageSpendPerProject = totalProjects > 0 ? activeSpent / totalProjects : 0;

        const projects = projectRows.map((p) => {
          const budget = p.total_budget !== null ? Number(p.total_budget) : null;
          const spent = Number(p.spent ?? 0);
          const spentPercentage = budget && budget > 0 ? (spent / budget) * 100 : 0;
          return {
            project_id: p.project_id,
            name: p.name,
            total_budget: budget,
            currency: p.currency,
            spent,
            staff_count: Number(p.staff_count ?? 0),
            spent_percentage: Number(spentPercentage.toFixed(2)),
          };
        });

        const expensesByMonth = monthRows.map((r) => ({
          month: r.month,
          category: r.category as string,
          amount: Number(r.total),
        }));

        // Computed here, not client-side: totalSpent is the divisor and may be 0.
        const topCategoryAmount = Number(topCategoryRow?.total ?? 0);
        const topExpenseCategory = topCategoryRow
          ? {
              category: topCategoryRow.category,
              amount: topCategoryAmount,
              percentage:
                totalSpent > 0
                  ? Number(((topCategoryAmount / totalSpent) * 100).toFixed(2))
                  : 0,
            }
          : null;

        return json(200, {
          year,
          summary: {
            topExpenseCategory,
            totalSpent,
            totalProjects,
            averageSpendPerProject: Number(averageSpendPerProject.toFixed(2)),
          },
          projects,
          expensesByMonth,
        });
      } catch (err) {
        console.error('Dashboard query failed:', err);
        return json(500, { message: 'Failed to load dashboard' });
      }
    }
    // GET /projects/{id}/members
    if (normalizedPath.endsWith('/members') && method === 'GET') {
      const parts = normalizedPath.split('/').filter(Boolean);
      // handles both /projects/1/members and /1/members
      const id = parts.length === 3 ? parts[1] : parts[0];
      if (!id) return json(400, { message: 'id is required' });
      if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
      if (!(await canAccessProject(user.userId!, Number(id)))) {
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
    }
    // GET /projects/assignable-staff
    // Declared before the /{id} routes: those now require a numeric segment, but
    // keeping the literal path first also documents that it is not a project id.
    if ((normalizedPath === '/assignable-staff' || normalizedPath.endsWith('/assignable-staff')) && method === 'GET') {
      if (!(await canListAssignableStaff(user.userId!))) {
        return json(403, { message: 'You do not have access to assign staff' });
      }
      const staff = await db
        .selectFrom('branch.users')
        .select(['user_id', 'name', 'email', 'profile_image'])
        .orderBy('name', 'asc')
        .execute();
      return json(200, { staff });
    }

    // GET /projects
    if (rawPath === '/' && method === 'GET') {
      const projects = user.isAdmin
        ? await db.selectFrom("branch.projects").selectAll().orderBy('project_id', 'asc').execute()
        : await db
            .selectFrom("branch.projects as p")
            .innerJoin("branch.project_memberships as pm", "pm.project_id", "p.project_id")
            .where("pm.user_id", "=", user.userId!)
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
    }

    // GET /projects/{id}/overview
    // One call for the whole detail page: the header, the funding donut, the
    // staff column and the expenses table previously needed three round trips
    // and still could not show a spend total without summing on the client.
    if (normalizedPath.endsWith('/overview') && method === 'GET') {
      const segments = normalizedPath.split('/').filter(Boolean);
      const id = projectIdFrom(segments[segments.length - 2]);
      if (id === null) return json(400, { message: 'Project id must be a valid number' });

      if (!(await canAccessProject(user.userId!, id))) {
        return json(403, { message: 'You do not have access to this project' });
      }

      const project = await db
        .selectFrom('branch.projects')
        .where('project_id', '=', id)
        .selectAll()
        .executeTakeFirst();
      if (!project) return json(404, { message: `Project not found for id: ${id}` });

      const [members, expenditures, donationRow, canEdit] = await Promise.all([
        db
          .selectFrom('branch.project_memberships as pm')
          .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
          .select(['u.user_id', 'u.name', 'u.email', 'u.profile_image', 'pm.role'])
          .where('pm.project_id', '=', id)
          .orderBy('u.name', 'asc')
          .execute(),
        db
          .selectFrom('branch.expenditures')
          .where('project_id', '=', id)
          .selectAll()
          .orderBy('spent_on', 'desc')
          .execute(),
        db
          .selectFrom('branch.project_donations')
          .select(db.fn.sum('amount').as('total'))
          .where('project_id', '=', id)
          .executeTakeFirst(),
        // Returned so the UI does not have to re-derive the rule: editing is
        // open to a project's Directors as well as admins, so gating the
        // button on `isAdmin` alone would hide it from people who may edit.
        canEditProject(user.userId!, id),
      ]);

      const totalBudget = project.total_budget !== null ? Number(project.total_budget) : 0;
      // The table below lists every expenditure, including the ones still in
      // review; the stats beside it count only what was approved.
      const approved = expenditures.filter((e) => e.status === APPROVED_EXPENDITURE_STATUS);
      const totalSpent = approved.reduce((sum, e) => sum + Number(e.amount), 0);
      // Guarded because a project may legitimately have no budget set yet, and
      // 0/0 would render as NaN% in the donut.
      const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

      return json(200, {
        project,
        stats: {
          totalBudget,
          totalSpent,
          totalRemaining: totalBudget - totalSpent,
          spentPercentage: Number(spentPercentage.toFixed(2)),
          totalDonated: Number(donationRow?.total ?? 0),
          memberCount: members.length,
          expenditureCount: approved.length,
        },
        members,
        expenditures,
        isActive: isProjectActive(project.end_date),
        canEdit,
      });
    }

    // GET /projects/{id}/donors
    const parts = normalizedPath.split('/');
    if (parts.length === 3 && parts[2] === 'donors' && method === 'GET') {
      const id = parts[1];


      if (!id) return json(400, { message: 'id is required' });
      if (isNaN(Number(id))) {
        return json(400, { message: 'Project id must be a valid number' });
      }
      if (!(await canAccessProject(user.userId!, Number(id)))) {
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
    }

    // GET /projects/{id}
    if (rawPath.startsWith('/') && rawPath.split('/').length === 2 && method === 'GET') {
      const id = rawPath.split('/')[1];
      if (!id) return json(400, { message: 'id is required' });
      if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
      if (!(await canAccessProject(user.userId!, Number(id)))) {
        return json(403, { message: 'You do not have access to this project' });
      }
      const project = await db.selectFrom("branch.projects").where("project_id", "=", Number(id)).selectAll().executeTakeFirst();
      if (!project) return json(404, { message: `Project not found for id: ${id}` });
      return json(200, project);
    }


    // PUT /projects/{id}
    if (rawPath.startsWith('/') && rawPath.split('/').length === 2 && method === 'PUT') {
      const id = rawPath.split('/')[1];
      if (!id) return json(400, { message: 'id is required' });
      if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });
      if (!(await canEditProject(user.userId!, Number(id)))) {
        return json(403, { message: 'You do not have access to edit this project' });
      }
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      } catch (e) {
        return json(400, { message: 'Invalid JSON in request body' });
      }

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
    }
    
    // DELETE /projects/{id}
    if (normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2 && method === 'DELETE') {
      const id = rawPath.split('/')[1];
      if (!id) return json(400, { message: 'id is required' });
      if (!/^\d+$/.test(id)) return json(400, { message: 'id must be a valid number' });

      // The gate at the top of this handler establishes authentication but not
      // authorization; this route previously had neither check, so any
      // authenticated user could delete any project.
      if (!(await canDeleteProject(user.userId!))) {
        return json(403, { message: 'Admin access required' });
      }

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
    }

    // POST /projects
    if ((normalizedPath === '' || normalizedPath === '/' || normalizedPath === '/projects') && method === 'POST') {
      if (!(await canCreateProject(user.userId!))) {
        return json(403, { message: 'Admin access required' });
      }
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      } catch (e) {
        return json(400, { message: 'Invalid JSON in request body' });
      }

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
    }

    // GET /projects/{id}/expenditures
    if (normalizedPath.endsWith('/expenditures') && method === 'GET') {
      const pathParts = normalizedPath.split('/').filter(Boolean);

      let id: string | undefined;
      if (pathParts.length === 3 && pathParts[0] === 'projects') {
        id = pathParts[1];
      } else if (pathParts.length === 2) {
        id = pathParts[0];
      }
      if (!id) return json(400, { message: 'id is required' });
      if (!/^\d+$/.test(id)) return json(400, { message: 'Project id must be a valid number' });

      if (!(await canAccessProject(user.userId!, Number(id)))) {
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
    }

    // <<< ROUTES-END

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

/**
 * Path segments carrying a project id are matched with this rather than a bare
 * "is there a segment here" check. Without it `/projects/assignable-staff`
 * matches `GET /projects/{id}` with `id = "assignable-staff"`, which reaches
 * the DB as `NaN` and surfaces as a confusing 403 instead of routing correctly.
 */
function projectIdFrom(segment: string | undefined): number | null {
  if (!segment || !/^\d+$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * `pg` hands back DATE columns as `Date`, but every date the API accepts and
 * returns is a `YYYY-MM-DD` string, so comparisons must go through this.
 */
function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Rows keyed by project id, for stitching aggregates onto a project list. */
function indexByProject<T extends { project_id: number }>(
  rows: T[],
  pick: (row: T) => number,
): Map<number, number> {
  return new Map(rows.map((row) => [row.project_id, pick(row)]));
}

/**
 * Per-project spend and headcount, aggregated in two grouped queries rather
 * than one query per project — the list page renders every project the caller
 * can see, so a per-row lookup is an N+1 that grows with the org.
 */
async function loadProjectAggregates(projectIds: number[]): Promise<{
  spent: Map<number, number>;
  members: Map<number, number>;
}> {
  if (projectIds.length === 0) return { spent: new Map(), members: new Map() };

  const [spentRows, memberRows] = await Promise.all([
    db
      .selectFrom('branch.expenditures')
      .select(['project_id', db.fn.sum('amount').as('total')])
      .where('status', '=', APPROVED_EXPENDITURE_STATUS)
      .where('project_id', 'in', projectIds)
      .groupBy('project_id')
      .execute(),
    db
      .selectFrom('branch.project_memberships')
      .select(['project_id', db.fn.count('user_id').as('count')])
      .where('project_id', 'in', projectIds)
      .groupBy('project_id')
      .execute(),
  ]);

  return {
    spent: indexByProject(spentRows, (r) => Number(r.total ?? 0)),
    members: indexByProject(memberRows, (r) => Number(r.count ?? 0)),
  };
}

/**
 * A project is archived once it has an end date that has passed. The "this
 * project is still in progress" checkbox in the UI simply clears `end_date`,
 * so a null end date is always active.
 */
function isProjectActive(endDate: unknown, today = new Date()): boolean {
  const iso = toIsoDate(endDate);
  if (!iso) return true;
  return iso >= today.toISOString().slice(0, 10);
}

/**
 * Replaces a project's roster with `members` inside the caller's transaction.
 *
 * Delete-then-insert rather than a diff: the set is small and bounded by the
 * staff list, and doing it in one transaction means a failed insert cannot
 * leave the project with nobody assigned.
 */
async function syncMemberships(
  trx: Transaction<DB>,
  projectId: number,
  members: MemberAssignment[],
): Promise<void> {
  await trx
    .deleteFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .execute();

  if (members.length === 0) return;

  await trx
    .insertInto('branch.project_memberships')
    .values(
      members.map((m) => ({
        project_id: projectId,
        user_id: m.user_id,
        role: m.role,
      })),
    )
    .execute();
}

/** Rejects member ids that are not real users, so FK errors never reach the client as a 500. */
async function findUnknownUserIds(members: MemberAssignment[]): Promise<number[]> {
  if (members.length === 0) return [];
  const ids = members.map((m) => m.user_id);
  const found = await db
    .selectFrom('branch.users')
    .select('user_id')
    .where('user_id', 'in', ids)
    .execute();
  const known = new Set(found.map((r) => r.user_id));
  return ids.filter((id) => !known.has(id));
}

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
