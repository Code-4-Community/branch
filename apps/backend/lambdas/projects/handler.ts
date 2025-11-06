import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { ProjectValidationUtils } from './validation-utils';

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

    // POST /projects
    if ((normalizedPath === '' || normalizedPath === '/' || normalizedPath === '/projects') && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

      const nameResult = ProjectValidationUtils.validateName(body.name);
      if (!nameResult.isValid) {
        return json(400, { message: nameResult.error });
      }

      const values: any = { name: nameResult.value };

      const parsedBudget = ProjectValidationUtils.parseNumericToFixed2(body.total_budget);
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

      try {
        const inserted = await db
          .insertInto('branch.projects')
          .values(values)
          .returning(['project_id','name','total_budget','currency','start_date','end_date','created_at'])
          .executeTakeFirst();

        return json(201, inserted);
      } catch (e) {
        console.error('DB insert failed', e);
        return json(500, { message: 'Failed to create project' });
      }
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
