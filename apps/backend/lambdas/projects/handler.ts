import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import db from './db';

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
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return json(400, { message: "'name' is required" });
      }

      const values: any = { name };
      function parseNumericToFixed2(input: unknown): string | null | 'INVALID' {
        if (input === undefined || input === null || input === '') return null;
        let numeric: number;
        if (typeof input === 'number') {
          numeric = input;
        } else if (typeof input === 'string') {
          const trimmed = input.trim();
          if (trimmed === '') return null;
          numeric = Number(trimmed);
        } else {
          numeric = NaN;
        }
        if (!Number.isFinite(numeric)) return 'INVALID';
        return numeric.toFixed(2);
      }

      // total_budget: accept number or numeric string; store as fixed-2 string
      const parsedBudget = parseNumericToFixed2(body.total_budget);
      if (parsedBudget === 'INVALID') return json(400, { message: "'total_budget' must be a number" });
      if (parsedBudget !== null) values.total_budget = parsedBudget;

      // start_date, end_date: accept YYYY-MM-DD
      const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (typeof body.start_date === 'string') {
        if (!isValidDate(body.start_date)) return json(400, { message: "'start_date' must be YYYY-MM-DD" });
        values.start_date = body.start_date;
      }
      if (typeof body.end_date === 'string') {
        if (!isValidDate(body.end_date)) return json(400, { message: "'end_date' must be YYYY-MM-DD" });
        values.end_date = body.end_date;
      }

      // currency: optional, short code
      if (typeof body.currency === 'string') {
        const c = body.currency.trim();
        if (c.length === 0 || c.length > 10) return json(400, { message: "'currency' must be 1-10 chars" });
        values.currency = c;
      }

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
