import type { RouteCtx } from '@branch/lambda-http';
import { json } from '@branch/lambda-http';
import db from '../db';
import { DonorValidationUtils } from '../validation-utils';

// Authentication and the route's permission are enforced by dispatch before any
// of these run — see routes.ts.

// GET /donors
export async function getDonors({ event }: RouteCtx) {
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

    // The count does not depend on the page, so both go out at once.
    const [totalCount, donors] = await Promise.all([
      db.selectFrom('branch.donors').select(db.fn.count('donor_id').as('count')).executeTakeFirst(),
      db
        .selectFrom('branch.donors')
        .selectAll()
        .orderBy('donor_id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    return json(200, {
      data: donors,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const donors = await db.selectFrom('branch.donors').selectAll().execute();
  return json(200, { data: donors });
}

// POST /donors
export async function createDonor({ event }: RouteCtx) {
  const body = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};

  const validationResult = DonorValidationUtils.validateDonorInput(body);
  if (validationResult instanceof Error) {
    return json(400, { message: validationResult.message });
  }

  const { organization, contactName, contactEmail } = validationResult;

  try {
    await db
      .insertInto('branch.donors')
      .values({
        organization,
        contact_name: contactName ?? null,
        contact_email: contactEmail ?? null,
      })
      .executeTakeFirst();
  } catch (err) {
    console.error('Database insert error:', err);
    return json(500, { message: 'Failed to create donor' });
  }

  return json(201, {
    ok: true,
    route: 'POST /donors',
    body: {
      organization,
      contactName: contactName ?? null,
      contactEmail: contactEmail ?? null,
    },
  });
}

// DELETE /donors/{id}
export async function deleteDonor({ params }: RouteCtx) {
  const id = params.id;
  if (!id || !/^\d+$/.test(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const deleted = await db.deleteFrom('branch.donors').where('donor_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Donor not found' });
  }

  return json(200, { ok: true, route: 'DELETE /donors/{id}', pathParams: { id } });
}
