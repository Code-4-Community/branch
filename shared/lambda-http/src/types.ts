import type { APIGatewayProxyResult } from 'aws-lambda';

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
}

export type RouteHandler = (ctx: RouteCtx) => Promise<APIGatewayProxyResult>;

export interface Route {
  /** HTTP method, case-insensitive. */
  method: string;
  /** Full prefixed path pattern with `:param` segments, e.g. `/projects/:id/members`. */
  pattern: string;
  handler: RouteHandler;
}

export interface DispatchOptions {
  /** Service prefix without slashes, e.g. `auth`, `projects`. */
  prefix: string;
  routes: Route[];
}
