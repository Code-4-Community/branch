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
    
    // GET /projects
    if (rawPath === '/' && method === 'GET') {
      const projects = await db.selectFrom("branch.projects").selectAll().execute();
      return json(200, projects);
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
      const body = event.body ? JSON.parse(event.body) as Record<string, {name:string, total_budget:number}> : {};
      const updatedProject = await db
        .updateTable("branch.projects")
        .set(body)
        .where("project_id", "=", Number(id))
        .returning(["project_id", "name", "total_budget"]) // control returned fields
        .executeTakeFirst();
      if (!updatedProject) return json(404, { message: `Project not found for id: ${id}` });
      return json(200, updatedProject);
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
