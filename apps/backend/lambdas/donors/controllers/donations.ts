import type { RouteCtx } from '@branch/lambda-http';
import { json } from '@branch/lambda-http';
import db from '../db';
import { authenticateRequest } from '../auth';

// GET /donors/donations
export async function getDonations({ event }: RouteCtx) {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }

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

  if (page && limit) {
    const offset = (page - 1) * limit;

    const totalCount = await db
      .selectFrom('branch.project_donations')
      .select(db.fn.count('donation_id').as('count'))
      .executeTakeFirst();

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    const donations = await db
      .selectFrom('branch.project_donations')
      .selectAll()
      .orderBy('donation_id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute();

    return json(200, {
      data: donations,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const donations = await db
    .selectFrom('branch.project_donations')
    .selectAll()
    .execute();
  return json(200, { data: donations });
}

// POST /donors/donations
export async function createDonation({ event }: RouteCtx) {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }

  const body = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  const { donor_id, project_id, amount } = body;

  if (donor_id === undefined || project_id === undefined || amount === undefined) {
    return json(400, { message: 'donor_id, project_id, and amount are required' });
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
  // Check user is admin or a member of the project
  if (!authContext.user?.isAdmin) {
    const userId = authContext.user!.userId as number;
    const membership = await db
      .selectFrom('branch.project_memberships')
      .select('membership_id')
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!membership) {
      return json(403, { message: 'You must be a member' });
    }
  }

  // Checked after the membership check so project existence isn't leaked to non-members
  const donor = await db
    .selectFrom('branch.donors')
    .select('donor_id')
    .where('donor_id', '=', donorId)
    .executeTakeFirst();

  if (!donor) {
    return json(404, { message: 'Donor not found' });
  }

  const project = await db
    .selectFrom('branch.projects')
    .select('project_id')
    .where('project_id', '=', projectId)
    .executeTakeFirst();

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
      })
      .returningAll()
      .executeTakeFirstOrThrow();

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
export async function deleteDonation({ event, params }: RouteCtx) {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }

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

  if (!authContext.user?.isAdmin) {
    const userId = authContext.user!.userId as number;
    const membership = await db
      .selectFrom('branch.project_memberships')
      .select('membership_id')
      .where('project_id', '=', donation.project_id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!membership) {
      return json(403, { message: 'You must be a member of this project to delete this donation' });
    }
  }

  const deleted = await db.deleteFrom('branch.project_donations').where('donation_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Donation not found' });
  }

  return json(200, { ok: true, route: 'DELETE /donations/{id}', pathParams: { id } });
}
