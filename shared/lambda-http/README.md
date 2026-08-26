# @branch/lambda-http

Shared HTTP layer for the lambdas in `apps/backend/lambdas`. Replaces the
per-handler `if (normalizedPath === ...)` chains with a declarative route table.

## Usage

```ts
// handler.ts
import { dispatch } from '@branch/lambda-http';
import { routes } from './routes';

export const handler = (event: any) => dispatch(event, { prefix: 'projects', routes });
```

```ts
// routes.ts — first match wins, so literals go before `:param` patterns
import type { Route } from '@branch/lambda-http';

export const routes: Route[] = [
  { method: 'GET', pattern: '/projects/dashboard', handler: getDashboard },
  { method: 'GET', pattern: '/projects/:id', handler: getProject },
];
```

A handler receives `{ event, params, method, path, auth }` and returns an
`APIGatewayProxyResult`, normally via `json(status, body)`. `auth` carries the
already-verified `AuthContext` and the `@branch/rbac` subject — a controller
must not authenticate again.

Every route declares its gate, and the `Route` union has no default arm, so
omitting one is a compile error:

```ts
{ method: 'GET',  pattern: '/reports',      permission: 'reports:view', handler: listReports }
{ method: 'GET',  pattern: '/projects/:id', access: 'authenticated',    handler: getProject }
{ method: 'POST', pattern: '/auth/login',   access: 'public',           handler: login }
```

`permission` accepts only a `GlobalAction`. Record-scoped rules
(`expense:update`, `project:view`) have nothing to evaluate against at the
routing layer and are checked in the controller with `requirePermission` once
the row is loaded.

## What dispatch handles centrally

- **Both path shapes.** API Gateway's `{proxy+}` forwards the full path
  (`/projects/7`); the shared dev-server strips the first segment (`/7`).
  Paths are canonicalized to the prefixed form, so one table serves both.
- **Authentication and the route's permission**, resolved once per request via
  `resolveAuth`. A controller that runs has already cleared its route's gate.
- OPTIONS preflight, `GET /<prefix>/health`, 404, and 500.
- CORS headers on every response, via `json`.
- **Sentry reporting for the 500 path.** The Sentry Lambda layer wraps the
  handler and records *uncaught throws* only. Every lambda catches instead, so
  API Gateway gets a JSON 500 rather than a 502 — which means an error that is
  never handed to `reportError` is an error Sentry never sees. `dispatch`
  reports what reaches its own catch; a controller that returns its own 500
  must use `serverError`.

## Exports

| Export | Purpose |
| --- | --- |
| `dispatch(event, { prefix, routes, resolveAuth })` | Route an event; returns a response. |
| `json(status, body)` | JSON response with CORS headers. |
| `parseBody(event)` | Parse a JSON body; `null` when malformed. |
| `requirePermission(subject, action, resource?)` | 403 carrying the policy's own reason, or `undefined` when allowed. |
| `createAuthResolver(authenticate, loadSubject)` | Bind a service's db-scoped auth into the `resolveAuth` dispatch expects. |
| `matchPattern(pattern, path)` | Params on match, `null` otherwise. |
| `serverError(err, message, body?)` | Log, report to Sentry, return a 500. Use instead of a bare `json(500, ...)` in a catch. |
| `reportError(err, context?)` | Report to Sentry without producing a response. No-op when the layer is absent (local, tests). |

## Build

Compiles to a gitignored `dist/` that lambdas consume as a `file:` dependency,
and depends on `@branch/rbac`'s and `@branch/lambda-auth`'s own `dist/`, so
build those first (`.github/actions/build-shared-packages` does exactly this):

```bash
npm ci --prefix shared/rbac && npm run build --prefix shared/rbac
npm ci --prefix shared/lambda-auth && npm run build --prefix shared/lambda-auth
npm ci --prefix shared/lambda-http && npm run build --prefix shared/lambda-http
npm test --prefix shared/lambda-http
```
