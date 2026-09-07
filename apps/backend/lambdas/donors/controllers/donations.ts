import type { RouteCtx } from '@branch/lambda-http';
import { json, requirePermission } from '@branch/lambda-http';
import { projectScopeIds } from '@branch/rbac';
import { METRICS, recordEvent, recordValue } from '@branch/lambda-telemetry';
import { sql, type SqlBool } from 'kysely';
import db from '../db';

// Authentication and the route's permission are enforced by dispatch before any
// of these run — see routes.ts.

// GET /donors/donations
export async function getDonations({ event, auth }: RouteCtx) {
  const queryParams = event.queryStringParameters || {};
  const pageStr = queryParams.page as string | undefined;
  const limitStr = queryParams.limit as string | undefined;

  if (pageStr !== undefined) {
    if (!/^\d+$/.test(pageStr) || parseInt(pageStr, 10) < 1) {
      return json(400, { message: 'page must be a positive integer' });
    }
  }

  if (limitStr !== undefined) {
    if (!/^\d+$/.test(limitStr) || parseInt(limitStr, 10) < 1) {
      return json(400, { message: 'limit must be a positive integer' });
    }
  }

  const page = pageStr ? parseInt(pageStr, 10) : null;
  const limit = limitStr ? parseInt(limitStr, 10) : null;

  // A non-admin only ever sees donations to their own projects. Applied in SQL
  // so the count and the page agree — filtering after the LIMIT would return
  // short pages and a total the caller is not allowed to know.
  // `= ANY($1)` and not `IN ($1, ..., $n)`: one bound array is one entry in the
  // plan cache whatever the caller's project count, instead of a fresh plan per
  // distinct cardinality.
  const scope = projectScopeIds(auth.subject);
  const inScope = scope ? sql<SqlBool>`project_id = ANY(${scope})` : null;

  if (page && limit) {
    const offset = (page - 1) * limit;

    let countQuery = db
      .selectFrom('branch.project_donations')
      .select(db.fn.count('donation_id').as('count'));
    if (inScope) countQuery = countQuery.where(inScope);

    let pageQuery = db
      .selectFrom('branch.project_donations')
      .selectAll()
      .orderBy('donation_id', 'asc');
    if (inScope) pageQuery = pageQuery.where(inScope);

    // Same predicate on both, and neither depends on the other.
    const [totalCount, donations] = await Promise.all([
      countQuery.executeTakeFirst(),
      pageQuery.limit(limit).offset(offset).execute(),
    ]);

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    return json(200, {
      data: donations,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  let query = db.selectFrom('branch.project_donations').selectAll();
  if (inScope) query = query.where(inScope);
  const donations = await query.execute();
  return json(200, { data: donations });
}

// POST /donors/donations
export async function createDonation({ event }: RouteCtx) {
  const body = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  const { donor_id, project_id, amount, donated_at } = body;

  if (donor_id === undefined || project_id === undefined || amount === undefined) {
    return json(400, { message: 'donor_id, project_id, and amount are required' });
  }

  // Optional: the column defaults to now(), so an omitted date still works.
  // Accepted so a donation can be backdated to when it was actually received.
  let donatedAt: Date | undefined;
  if (donated_at !== undefined && donated_at !== null && donated_at !== '') {
    if (typeof donated_at !== 'string') {
      return json(400, { message: 'donated_at must be a date string' });
    }
    const parsed = new Date(donated_at);
    if (Number.isNaN(parsed.getTime())) {
      return json(400, { message: 'donated_at must be a valid date' });
    }
    donatedAt = parsed;
  }
  // Numeric fields arrive as strings from form posts; amount is NUMERIC(12,2)
  const num = (value: unknown) =>
    typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  const donorId = num(donor_id);
  const projectId = num(project_id);
  const donationAmount = num(amount);

  if (!Number.isInteger(donorId) || donorId < 1) {
    return json(400, { message: 'donor_id must be a positive integer' });
  }
  if (!Number.isInteger(projectId) || projectId < 1) {
    return json(400, { message: 'project_id must be a positive integer' });
  }
  if (!isFinite(donationAmount) || donationAmount <= 0) {
    return json(400, { message: 'amount must be a positive number' });
  }

  // Both existence checks up front, together: the FK violation below would also
  // 404, but only with the combined "Donor or project not found" message, and
  // these two tell the caller which id was wrong.
  const [donor, project] = await Promise.all([
    db.selectFrom('branch.donors').select('donor_id').where('donor_id', '=', donorId).executeTakeFirst(),
    db
      .selectFrom('branch.projects')
      .select('project_id')
      .where('project_id', '=', projectId)
      .executeTakeFirst(),
  ]);

  if (!donor) {
    return json(404, { message: 'Donor not found' });
  }

  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  try {
    const donation = await db
      .insertInto('branch.project_donations')
      .values({
        donor_id: donorId,
        project_id: projectId,
        amount: donationAmount,
        ...(donatedAt ? { donated_at: donatedAt } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Ids stay out of the labels; the rollups answer per-project questions.
    recordEvent(METRICS.DONATION_RECORDED, { backdated: donatedAt !== undefined });
    recordValue(METRICS.DONATION_AMOUNT, donationAmount);

    return json(201, { data: donation });
  } catch (err: any) {
    if (err?.code === '23505') {
      return json(409, { message: 'A donation from this donor to this project already exists' });
    }
    if (err?.code === '23503') {
      return json(404, { message: 'Donor or project not found' });
    }
    throw err;
  }
}

// DELETE /donors/donations/{id}
export async function deleteDonation({ params, auth }: RouteCtx) {
  const id = params.id;
  if (!id || !/^\d+$/.test(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const donation = await db
    .selectFrom('branch.project_donations')
    .where('donation_id', '=', Number(id))
    .selectAll()
    .executeTakeFirst();

  if (!donation) {
    return json(404, { message: 'Donation not found' });
  }

  // Writing donations is admin-only (route permission), but a 404 must not
  // leak the existence of a donation on a project the caller cannot see.
  const invisible = requirePermission(auth.subject, 'donation:view', {
    projectId: donation.project_id,
  });
  if (invisible) return json(404, { message: 'Donation not found' });

  const deleted = await db.deleteFrom('branch.project_donations').where('donation_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Donation not found' });
  }

  return json(200, { ok: true, route: 'DELETE /donations/{id}', pathParams: { id } });
}
