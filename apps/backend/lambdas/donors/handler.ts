import { APIGatewayProxyResult } from 'aws-lambda';
import { dispatch, json, RouteCtx } from '@branch/lambda-http';
import db from './db';
import { authenticateRequest } from './auth';

async function requireAuth(event: any): Promise<APIGatewayProxyResult | null> {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }
  return null;
}

// GET /donors
async function listDonors({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

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
      .selectFrom('branch.donors')
      .select(db.fn.count('donor_id').as('count'))
      .executeTakeFirst();

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    const donors = await db
      .selectFrom('branch.donors')
      .selectAll()
      .orderBy('donor_id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute();

    return json(200, {
      data: donors,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const donors = await db.selectFrom('branch.donors').selectAll().execute();
  return json(200, { data: donors });
}

// GET /donors/donations
async function listDonations({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

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

// POST /donors
async function createDonor({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  // TODO: Add your business logic here
  return json(201, { ok: true, route: 'POST /donors', body });
}

export const handler = (event: any): Promise<APIGatewayProxyResult> =>
  dispatch(event, {
    prefix: 'donors',
    routes: [
      { method: 'GET', pattern: '/donors', handler: listDonors },
      { method: 'GET', pattern: '/donors/donations', handler: listDonations },
      { method: 'POST', pattern: '/donors', handler: createDonor },
    ],
  });
