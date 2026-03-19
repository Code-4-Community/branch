import db from './db';

type LambdaResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};
import { ExpenditureValidationUtils } from './validation-utils';
import { authenticateRequest } from './auth';

export const handler = async (event: any): Promise<LambdaResponse> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    // Health check
    if ((normalizedPath.endsWith('/health') || normalizedPath === '/health') && method === 'GET') {
      return json(200, { ok: true, timestamp: new Date().toISOString() });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    
    // GET /expenditures
    if ((normalizedPath === '/expenditures' || normalizedPath === '' || normalizedPath === '/') && method === 'GET') {
      const queryParams = event.queryStringParameters || {};

      const pageParam = queryParams.page;
      const limitParam = queryParams.limit;
      const projectIdParam = queryParams.projectId;

      const hasPage = pageParam !== undefined;
      const hasLimit = limitParam !== undefined;

      if ((hasPage && !hasLimit) || (!hasPage && hasLimit)) {
        return json(400, { message: 'Both page and limit are required for pagination' });
      }

      let projectId: number | undefined;
      if (projectIdParam !== undefined) {
        const parsedProjectId = Number(projectIdParam);
        if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
          return json(400, { message: 'projectId must be a positive integer' });
        }
        projectId = parsedProjectId;
      }

      let baseQuery = db
        .selectFrom('branch.expenditures')
        .selectAll();

      if (projectId) {
        baseQuery = baseQuery.where('project_id', '=', projectId);
      }

      baseQuery = baseQuery.orderBy('created_at', 'desc');

      // Paginated response
      if (hasPage && hasLimit) {
        const page = Number(pageParam);
        const limit = Number(limitParam);

        if (!Number.isInteger(page) || !Number.isInteger(limit) || page <= 0 || limit <= 0) {
          return json(400, { message: 'page and limit must be positive integers' });
        }

        const offset = (page - 1) * limit;

        let countQuery = db
          .selectFrom('branch.expenditures')
          .select(db.fn.count('expenditure_id').as('count'));

        if (projectId) {
          countQuery = countQuery.where('project_id', '=', projectId);
        }

        const totalCountResult = await countQuery.executeTakeFirst();

        const totalItems = Number(totalCountResult?.count || 0);
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

        const expenditures = await baseQuery
          .limit(limit)
          .offset(offset)
          .execute();

        return json(200, {
          data: expenditures,
          pagination: {
            page,
            limit,
            totalItems,
            totalPages,
          },
        });
      }

      // Unpaginated response
      const expenditures = await baseQuery.execute();
      return json(200, { data: expenditures });
    }

    // POST /expenditures
    if ((normalizedPath === '/expenditures' || normalizedPath === '' || normalizedPath === '/') && method === 'POST') {
      // Authenticate the request
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

      const { projectID, amount, category, description, spentOn } = validationResult;

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
          spentOn: spentOn ?? new Date().toISOString().split('T')[0],
        },
      });
    }
    // <<< ROUTES-END 

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
