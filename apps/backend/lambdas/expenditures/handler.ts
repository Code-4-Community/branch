import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { ExpenditureValidationUtils } from './validation-utils';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
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
    
    // POST /expenditures
    if ((normalizedPath === '/expenditures' || normalizedPath === '' || normalizedPath === '/') && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
      
      // Validate input
      const validationResult = ExpenditureValidationUtils.validateExpenditureInput(body);
      if (validationResult instanceof Error) {
        return json(400, { message: validationResult.message });
      }

      const { projectId, enteredBy, amount, category, description, spentOn } = validationResult;

      // Check if project exists
      const project = await db
        .selectFrom('branch.projects')
        .where('project_id', '=', projectId)
        .selectAll()
        .executeTakeFirst();

      if (!project) {
        return json(404, { message: 'Project not found' });
      }

      // Check if enteredBy user exists (if provided)
      if (enteredBy !== undefined && enteredBy !== null) {
        const user = await db
          .selectFrom('branch.users')
          .where('user_id', '=', enteredBy)
          .selectAll()
          .executeTakeFirst();

        if (!user) {
          return json(404, { message: 'User not found' });
        }
      }

      // Insert expenditure
      try {
        await db
          .insertInto('branch.expenditures')
          .values({
            project_id: projectId,
            entered_by: enteredBy ?? null,
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
          projectId,
          enteredBy: enteredBy ?? null,
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
