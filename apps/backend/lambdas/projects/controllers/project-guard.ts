import type { APIGatewayProxyResult } from 'aws-lambda';
import type { RouteCtx } from '@branch/lambda-http';
import { json, requirePermission } from '@branch/lambda-http';
import { projectIdFrom } from '../services/projects';

type Resolved =
  | { projectId: number; response?: undefined }
  | { projectId?: undefined; response: APIGatewayProxyResult };

/**
 * Parse `:id` and check the caller may see that project.
 *
 * Every project-scoped read repeated these six lines; one slip in one of them
 * is a leak, so they are written once. `project:view` is record-scoped and
 * therefore cannot be declared on the route — this is the controller-side half
 * of the same policy.
 */
export function requireVisibleProject({ params, auth }: RouteCtx): Resolved {
  const raw = params.id;
  if (!raw) return { response: json(400, { message: 'id is required' }) };

  const projectId = projectIdFrom(raw);
  if (projectId === null) {
    return { response: json(400, { message: 'Project id must be a valid number' }) };
  }

  const denied = requirePermission(auth.subject, 'project:view', { projectId });
  if (denied) return { response: denied };

  return { projectId };
}
