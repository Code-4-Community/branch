import { APIGatewayProxyResult } from 'aws-lambda';
import { dispatch, json, RouteCtx } from '@branch/lambda-http';
import db from './db';
import { ExpenditureValidationUtils } from './validation-utils';
import { authenticateRequest } from './auth';

// GET /expenditures
async function listExpenditures({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }

  const queryParams = event.queryStringParameters || {};
  const pageStr = queryParams.page as string | undefined;
  const limitStr = queryParams.limit as string | undefined;
  const projectIdStr = queryParams.projectId as string | undefined;

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

  if (projectIdStr !== undefined) {
    if (!/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
      return json(400, { message: 'projectId must be a positive integer' });
    }
  }

  const page = pageStr ? parseInt(pageStr, 10) : null;
  const limit = limitStr ? parseInt(limitStr, 10) : null;
  const projectId = projectIdStr ? parseInt(projectIdStr, 10) : null;

  if (page && limit) {
    const offset = (page - 1) * limit;

    const totalCount = projectId !== null
      ? await db.selectFrom('branch.expenditures').where('project_id', '=', projectId).select(db.fn.count('expenditure_id').as('count')).executeTakeFirst()
      : await db.selectFrom('branch.expenditures').select(db.fn.count('expenditure_id').as('count')).executeTakeFirst();

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    const expenditures = projectId !== null
      ? await db.selectFrom('branch.expenditures').where('project_id', '=', projectId).selectAll().orderBy('spent_on', 'desc').limit(limit).offset(offset).execute()
      : await db.selectFrom('branch.expenditures').selectAll().orderBy('spent_on', 'desc').limit(limit).offset(offset).execute();

    return json(200, {
      data: expenditures,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const expenditures = projectId !== null
    ? await db.selectFrom('branch.expenditures').where('project_id', '=', projectId).selectAll().orderBy('spent_on', 'desc').execute()
    : await db.selectFrom('branch.expenditures').selectAll().orderBy('spent_on', 'desc').execute();

  return json(200, { data: expenditures });
}

// POST /expenditures
async function createExpenditure({ event }: RouteCtx): Promise<APIGatewayProxyResult> {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }

  const { user } = authContext;

  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  // Validate input
  const validationResult = ExpenditureValidationUtils.validateExpenditureInput(body);
  if (validationResult instanceof Error) {
    return json(400, { message: validationResult.message });
  }

  const { projectID, amount, category, description, status, receiptUrl, spentOn } = validationResult;

  // Authorize: must be global admin, or PI/Accountant/Admin on this project
  if (!user.isAdmin) {
    const membership = await db
      .selectFrom('branch.project_memberships')
      .where('project_id', '=', projectID)
      .where('user_id', '=', user.userId!)
      .select('role')
      .executeTakeFirst();

    if (!membership || !['PI', 'Accountant', 'Admin'].includes(membership.role)) {
      return json(403, { message: 'Unable to create expenditure for this project' });
    }
  }

  // Check if project exists
  const project = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', projectID)
    .selectAll()
    .executeTakeFirst();

  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  // Insert expenditure with authenticated user as entered_by
  try {
    await db
      .insertInto('branch.expenditures')
      .values({
        project_id: projectID,
        entered_by: user.userId!,
        amount,
        category: category ?? null,
        description: description ?? null,
        status,
        receipt_url: receiptUrl ?? null,
        spent_on: spentOn ? new Date(spentOn) : new Date(),
      })
      .executeTakeFirst();
  } catch (err) {
    console.error('Database insert error:', err);
    return json(500, { message: 'Failed to create expenditure' });
  }

  return json(201, {
    ok: true,
    route: 'POST /expenditures',
    body: {
      projectID,
      enteredBy: user.userId!,
      amount,
      category: category ?? null,
      description: description ?? null,
      status,
      receiptUrl: receiptUrl ?? null,
      spentOn: spentOn ?? new Date().toISOString().split('T')[0],
    },
  });
}

export const handler = (event: any): Promise<APIGatewayProxyResult> =>
  dispatch(event, {
    prefix: 'expenditures',
    routes: [
      { method: 'GET', pattern: '/expenditures', handler: listExpenditures },
      { method: 'POST', pattern: '/expenditures', handler: createExpenditure },
    ],
  });
