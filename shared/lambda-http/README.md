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

A handler receives `{ event, params, method, path }` and returns an
`APIGatewayProxyResult`, normally via `json(status, body)`.

## What dispatch handles centrally

- **Both path shapes.** API Gateway's `{proxy+}` forwards the full path
  (`/projects/7`); the shared dev-server strips the first segment (`/7`).
  Paths are canonicalized to the prefixed form, so one table serves both.
- OPTIONS preflight, `GET /<prefix>/health`, 404, and 500.
- CORS headers on every response, via `json`.

## Exports

| Export | Purpose |
| --- | --- |
| `dispatch(event, { prefix, routes })` | Route an event; returns a response. |
| `json(status, body)` | JSON response with CORS headers. |
| `parseBody(event)` | Parse a JSON body; `null` when malformed. |
| `requireAuth(ctx, level, resourceUserId?)` | 401/403 response, or `undefined` when allowed. |
| `createAuthGuard(authenticate)` | Bind a service's db-scoped `authenticateRequest` into an authenticate-and-authorize guard. |
| `matchPattern(pattern, path)` | Params on match, `null` otherwise. |

## Build

Compiles to a gitignored `dist/` that lambdas consume as a `file:` dependency,
and depends on `@branch/lambda-auth`'s own `dist/`, so build that one first:

```bash
npm ci --prefix shared/lambda-auth && npm run build --prefix shared/lambda-auth
npm ci --prefix shared/lambda-http && npm run build --prefix shared/lambda-http
npm test --prefix shared/lambda-http
```
