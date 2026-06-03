import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { ProjectValidationUtils } from './validation-utils';
import { authenticateRequest } from './auth';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const rawPath = event.rawPath || event.path || '/';
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

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here
    // GET /dashboard
    if ((normalizedPath === '/dashboard' || normalizedPath.endsWith('/dashboard')) && method === 'GET') {
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      const { user, error } = await authenticateRequest(authHeader);
      if (!user) {
        return json(401, { message: error || 'Authentication required' });
      }
      if (!user.isAdmin) {
        return json(403, { message: 'Admin access required' });
      }

      try {
        const [
          totalSpentRow,
          totalProjectsRow,
          topCategoryRow,
          projectRows,
          spentByProject,
          staffByProject,
          monthRows,
        ] = await Promise.all([
          db.selectFrom('branch.expenditures')
            .select(db.fn.sum('amount').as('total'))
            .executeTakeFirst(),
          db.selectFrom('branch.projects')
            .select(db.fn.count('project_id').as('count'))
            .executeTakeFirst(),
          db.selectFrom('branch.expenditures')
            .select(['category', db.fn.sum('amount').as('total')])
            .where('category', 'is not', null)
            .groupBy('category')
            .orderBy(db.fn.sum('amount'), 'desc')
            .limit(1)
            .executeTakeFirst(),
          db.selectFrom('branch.projects')
            .selectAll()
            .orderBy('project_id', 'asc')
            .execute(),
          db.selectFrom('branch.expenditures')
            .select(['project_id', db.fn.sum('amount').as('total')])
            .groupBy('project_id')
            .execute(),
          db.selectFrom('branch.project_memberships')
            .select(['project_id', db.fn.count('user_id').as('count')])
            .groupBy('project_id')
            .execute(),
          db.selectFrom('branch.expenditures')
            .select(['spent_on', 'category', 'amount'])
            .where('category', 'is not', null)
            .execute(),
        ]);

        const totalSpent = Number(totalSpentRow?.total ?? 0);
        const totalProjects = Number(totalProjectsRow?.count ?? 0);
        const averageSpendPerProject = totalProjects > 0 ? totalSpent / totalProjects : 0;

        const spentMap = new Map(spentByProject.map((r) => [r.project_id, Number(r.total)]));
        const staffMap = new Map(staffByProject.map((r) => [r.project_id, Number(r.count)]));

        const projects = projectRows.map((p) => {
          const budget = p.total_budget !== null ? Number(p.total_budget) : null;
          const spent = spentMap.get(p.project_id) ?? 0;
          const spentPercentage = budget && budget > 0 ? (spent / budget) * 100 : 0;
          return {
            project_id: p.project_id,
            name: p.name,
            total_budget: budget,
            currency: p.currency,
            spent,
            staff_count: staffMap.get(p.project_id) ?? 0,
            spent_percentage: Number(spentPercentage.toFixed(2)),
          };
        });

        const monthMap = new Map<string, { month: string; category: string; amount: number }>();
        for (const row of monthRows) {
          const d = new Date(row.spent_on as any);
          const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          const category = row.category as string;
          const key = `${month}|${category}`;
          const prev = monthMap.get(key);
          if (prev) prev.amount += Number(row.amount);
          else monthMap.set(key, { month, category, amount: Number(row.amount) });
        }
        const expensesByMonth = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

        return json(200, {
          summary: {
            topExpenseCategory: topCategoryRow
              ? { category: topCategoryRow.category, amount: Number(topCategoryRow.total ?? 0) }
              : null,
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
      const users = await db
        .selectFrom('branch.project_memberships as pm')
        .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
        .select([
          'u.user_id',
          'u.name',
          'u.email',
          'pm.role'
        ])
        .where('pm.project_id', '=', id)
        .execute();
      return json(200, {
        ok: true, route: 'GET /projects/{id}/members', pathParams: { id }, body: {
          users
        }
      });
    }
    // GET /projects
    if (rawPath === '/' && method === 'GET') {
      const projects = await db.selectFrom("branch.projects").selectAll().execute();
      return json(200, projects);
    }

    // GET /projects/{id}/donors
    const parts = normalizedPath.split('/');
    if (parts.length === 3 && parts[2] === 'donors' && method === 'GET') {
      const id = parts[1];


      if (!id) return json(400, { message: 'id is required' });
      if (isNaN(Number(id))) {
        return json(400, { message: 'Project id must be a valid number' });
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
      ).selectAll().execute();
      return json(200, { donors });
    }

    // GET /projects/{id}
    if (rawPath.startsWith('/') && rawPath.split('/').length === 2 && method === 'GET') {
      const id = rawPath.split('/')[1];
      if (!id) return json(400, { message: 'id is required' });
      const project = await db.selectFrom("branch.projects").where("project_id", "=", Number(id)).selectAll().executeTakeFirst();
      if (!project) return json(404, { message: `Project not found for id: ${id}` });
      return json(200, project);
    }


    // PUT /projects/{id}
    if (rawPath.startsWith('/') && rawPath.split('/').length === 2 && method === 'PUT') {
      const id = rawPath.split('/')[1];
      if (!id) return json(400, { message: 'id is required' });
      const body = event.body ? JSON.parse(event.body) as Record<string, { name: string, total_budget: number }> : {};
      const updatedProject = await db
        .updateTable("branch.projects")
        .set(body)
        .where("project_id", "=", Number(id))
        .returning(["project_id", "name", "description", "total_budget"]) // control returned fields
        .executeTakeFirst();
      if (!updatedProject) return json(404, { message: `Project not found for id: ${id}` });
      return json(200, updatedProject);
    }
    // <<< ROUTES-END
    // POST /projects
    if ((normalizedPath === '' || normalizedPath === '/' || normalizedPath === '/projects') && method === 'POST') {
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

      try {
        const inserted = await db
          .insertInto('branch.projects')
          .values(values)
          .returning(['project_id', 'name', 'description', 'total_budget', 'currency', 'start_date', 'end_date', 'created_at'])
          .executeTakeFirst();

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

      try {

        const project = await db
          .selectFrom('branch.projects')
          .where('project_id', '=', parseInt(id))
          .selectAll()
          .executeTakeFirst();

        if (!project) {
          return json(404, { message: 'Project not found' });
        }


        const expenditures = await db
          .selectFrom('branch.expenditures')
          .where('project_id', '=', parseInt(id))
          .selectAll()
          .orderBy('spent_on', 'desc')
          .execute();

        return json(200, expenditures);
      } catch (err) {
        console.error('Database error:', err);
        return json(500, { message: 'Failed to fetch expenditures', error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return json(404, { message: 'Not Found', path: normalizedPath, method });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
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
