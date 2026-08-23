import type { APIGatewayProxyResult } from 'aws-lambda';
import type { AuthContext } from '@branch/lambda-auth';
import type { GlobalAction, RbacSubject } from '@branch/rbac';

/** Who is calling, resolved once per request by `dispatch`. */
export interface RequestAuth {
  context: AuthContext;
  /** The policy subject. `ANONYMOUS` on a public route. */
  subject: RbacSubject;
}

/** Context handed to a matched route handler. */
export interface RouteCtx {
  /** Raw Lambda event (API Gateway proxy or Function URL / dev-server shape). */
  event: any;
  /** Path params captured from the route pattern (e.g. `:id` -> params.id). */
  params: Record<string, string>;
  /** Uppercased HTTP method. */
  method: string;
  /** Canonical, full-prefixed request path (e.g. `/projects/7/members`). */
  path: string;
  /**
   * Already authenticated and already authorized against the route's declared
   * permission. Controllers use `auth.subject` for record-level checks and
   * list scoping — they must not re-authenticate.
   */
  auth: RequestAuth;
}

export type RouteHandler = (ctx: RouteCtx) => Promise<APIGatewayProxyResult>;

interface RouteBase {
  /** HTTP method, case-insensitive. */
  method: string;
  /** Full prefixed path pattern with `:param` segments, e.g. `/projects/:id/members`. */
  pattern: string;
  handler: RouteHandler;
}

/**
 * A route must state its access, and the union makes that a compile error to
 * forget. There is no "unspecified" arm on purpose: the previous shape let a
 * new route ship with no gate at all, and nothing in review reliably catches an
 * omission.
 *
 * `permission` is restricted to `GlobalAction` because the routing layer has no
 * record in hand. Anything record-scoped (`expense:update`, `project:view`) is
 * checked inside the controller once the row is loaded — declare the coarse
 * area permission here and the fine one there.
 */
export type Route =
  | (RouteBase & { access: 'public'; permission?: never })
  | (RouteBase & { access: 'authenticated'; permission?: never })
  | (RouteBase & { access?: never; permission: GlobalAction });

export interface DispatchOptions {
  /** Service prefix without slashes, e.g. `auth`, `projects`. */
  prefix: string;
  routes: Route[];
  /**
   * Binds the service's db-scoped authentication. Required unless every route
   * is `access: 'public'` — dispatch returns 500 rather than serving a guarded
   * route without it.
   */
  resolveAuth?: (event: any) => Promise<RequestAuth>;
}
