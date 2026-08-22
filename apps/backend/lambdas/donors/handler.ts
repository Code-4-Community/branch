import { APIGatewayProxyResult } from 'aws-lambda';
import db from './db';
import { authenticateRequest } from './auth';
import { DonorValidationUtils } from './validation-utils';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Support both API Gateway and Lambda Function URL events
    // API Gateway: event.path, event.httpMethod
    // Function URL: event.rawPath, event.requestContext.http.method
    const fullPath = event.rawPath || event.path || '/';
    // API Gateway mounts this service at /donors[/{proxy+}]; strip the mount
    // prefix so routing below (rawPath and normalizedPath) sees the bare path.
    const rawPath = fullPath.replace(/^\/donors(?=\/|$)/, '') || '/';
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

    const authContext = await authenticateRequest(event);
    if (!authContext.isAuthenticated) {
      return json(401, { message: 'Authentication required' });
    }

    // >>> ROUTES-START (do not remove this marker)
    // CLI-generated routes will be inserted here

    // GET /donors
    if (rawPath === '/' && method === 'GET') {
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

    // GET /donations
    if ((normalizedPath === '/donations') && method === 'GET') {
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

    // POST /donations
    if (normalizedPath === '/donations' && method === 'POST') {
      const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
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
            ...(donatedAt ? { donated_at: donatedAt } : {}),
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

    // POST /donors
    if ((normalizedPath === '/' || normalizedPath === '' || normalizedPath === '/donors') && method === 'POST') {
        // Authenticate the request
        const { user } = authContext;

        if (!user) {
          return json(401, { message: 'Authentication required' });
        }
        if (!user.isAdmin) {
          return json(403, { message: 'Only admins can create donors' });
        }
  
        const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  
        // Validate input
        const validationResult = DonorValidationUtils.validateDonorInput(body);
        if (validationResult instanceof Error) {
          return json(400, { message: validationResult.message });
        }

        const { organization, contactName, contactEmail } = validationResult;  
        
        // Insert donor with authenticated user as entered_by
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
    if (/^\/[^\/]+$/.test(normalizedPath) && method === 'DELETE') {
      const id = normalizedPath.split('/')[1];
      if (!id || !/^\d+$/.test(id)) {
        return json(400, { message: 'id must be a positive integer' });
      }

      if (!authContext.user?.isAdmin) {
        return json(403, { message: 'Only admins can delete donors' });
      }

      const deleted = await db.deleteFrom('branch.donors').where('donor_id', '=', Number(id)).execute();
      if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
        return json(404, { message: 'Donor not found' });
      }

      return json(200, { ok: true, route: 'DELETE /donors/{id}', pathParams: { id } });
      
    }
    
    // DELETE /donations/{id}
    if (normalizedPath.startsWith('/donations/') && normalizedPath.split('/').length === 3 && method === 'DELETE') {
      const id = normalizedPath.split('/')[2];
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
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
