# AGENTS.md — lambdas

Each `<service>/` here is one Lambda. They share a near-identical shape. **Use the `lambda-cli` (below) to scaffold handlers and add routes** — it keeps `routes.ts` and `openapi.yaml` in sync. Hand-editing routes without it drifts the OpenAPI spec.

## Lambda anatomy

```
<service>/
  handler.ts        # entry: 4 lines — dispatch(event, { prefix, routes })
  routes.ts         # Route[] table; ROUTES-START/END markers bracket the entries
  controllers/      # <group>.ts files exporting RouteHandlers
  services/         # (projects, expenditures) shared query/business logic
  dev-server.ts     # local shared-server registration (port 3000)
  db.ts             # Kysely<DB> + pg.Pool
  auth.ts           # thin wrapper over @branch/lambda-auth + domain authz helpers
  openapi.yaml      # OpenAPI 3.0.3 spec (kept in sync by lambda-cli)
  swagger-utils.ts  # serves Swagger UI from openapi.yaml
  validation-utils.ts  # (some services) input validation classes
  report-service.ts    # (reports only) generation/S3 logic
  package.json tsconfig.json jest.config.js Dockerfile README.md
  test/             # *.unit.test.ts and/or *.e2e.test.ts
```

## Handler pattern

Routing is the shared `@branch/lambda-http` package, not a per-lambda if-chain. `handler.ts` is just:
```ts
import { dispatch } from '@branch/lambda-http';
import { routes } from './routes';

export const handler = (event: any) => dispatch(event, { prefix: 'donors', routes });
```
`routes.ts` declares the table — first match wins, so literal segments must precede `:param` ones:
```ts
import type { Route } from '@branch/lambda-http';
import { getDonors, createDonor } from './controllers/donors';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/donors', handler: getDonors },
  { method: 'POST', pattern: '/donors', handler: createDonor },
  // <<< ROUTES-END
];
```
Controllers live in `controllers/<group>.ts` as exported `RouteHandler`s — `async (ctx: RouteCtx) => APIGatewayProxyResult`, where `ctx` is `{ event, params, method, path }` and `params` holds the matched `:param` values (no more `normalizedPath.split('/')[N]`):
```ts
export const getDonor: RouteHandler = async ({ params }) => {
  const { id } = params;
  // ...
  return json(200, { ... });
};
```
- `dispatch()` handles OPTIONS preflight, `GET /<prefix>/health`, 404 and 500 centrally — routes.ts only lists real endpoints.
- **NEVER remove or modify the `ROUTES-START` / `ROUTES-END` markers** — the CLI inserts new table entries between them.
- Patterns are always full-prefixed (`/donors/:id`, never `/:id`) so one table works whether the event arrives via API Gateway's `{proxy+}` (full path) or the shared dev-server (prefix stripped) — `dispatch()` canonicalizes both to the prefixed form.
- Responses go through `json(status, body)` from `@branch/lambda-http`, which sets CORS headers (`Access-Control-Allow-Origin: *`, allowed headers `Content-Type,Authorization`). See `shared/lambda-http/README.md` for the full API (`parseBody`, `requireAuth`, `createAuthGuard`, `matchPattern`).

## Auth & authorization

**Every permission in the product is declared once, in `@branch/rbac`.** Read
`shared/rbac/README.md` (it carries the role matrix) before adding a gate.
Do not write a `canDoThing(userId, ...)` helper in a lambda — that pattern is
what this replaced, and a local copy is a rule the frontend cannot see.

Each lambda's `auth.ts` is now identical boilerplate binding the shared pieces to the local `db`:
```ts
import { authenticateRequest as _authenticateRequest, loadRbacSubject } from '@branch/lambda-auth';
import { createAuthResolver } from '@branch/lambda-http';
import db from './db';
export * from '@branch/lambda-auth';
export async function authenticateRequest(event: any) {
  return _authenticateRequest(db, event);
}
export const resolveAuth = createAuthResolver(authenticateRequest, (ctx) => loadRbacSubject(db, ctx));
```

`handler.ts` hands `resolveAuth` to `dispatch`, which calls it **once per request**.

### Two layers, and which one to use

1. **Route level** — declared in `routes.ts`, enforced by `dispatch` before the
   controller runs. Use it whenever the decision needs nothing but the caller:

   ```ts
   { method: 'GET',  pattern: '/reports',      permission: 'reports:view', handler: listReports }
   { method: 'GET',  pattern: '/projects/:id', access: 'authenticated',    handler: getProject }
   { method: 'POST', pattern: '/auth/login',   access: 'public',           handler: login }
   ```

   `Route` is a union with no default arm, so **forgetting the gate is a type
   error**. `permission` only accepts a `GlobalAction`; a record-scoped one would
   have nothing to evaluate against here and is rejected by the compiler.

2. **Record level** — inside the controller, once the row is loaded:

   ```ts
   const denied = requirePermission(auth.subject, 'expense:update', resourceOf(expenditure));
   if (denied) return denied;
   ```

   The 403 body is the policy's own `reason`, which is the same string the
   frontend puts in the disabled control's tooltip.

Controllers read `ctx.auth.subject` and **must not re-authenticate** — dispatch
already did, and a second call is a second round trip.

### List scoping

A non-admin must never receive a row they may not read, not even to filter it
out afterwards. Use `projectScopeIds(subject)` from `@branch/rbac` and push it
into the `where`; it returns `null` for an unrestricted caller and never an
empty array (`IN ()` is a syntax error, and skipping the filter on empty turns
"member of nothing" into "sees everything"). **Filter the pagination count with
the same predicate** or the total leaks what the page does not.

## DB access

`db.ts` exports a `Kysely<DB>` (`DB` from `@branch/types`) over a `pg.Pool`. Always qualify the schema:
```ts
await db.selectFrom('branch.users').where('cognito_sub', '=', sub).selectAll().executeTakeFirst();
await db.selectFrom('branch.users').select(db.fn.count('user_id').as('count')).executeTakeFirst();
```

**Aggregate and filter in SQL, not in the lambda.** Pulling rows over the wire to sum, group or filter them in JS costs a full table scan that no index can fix, and it grows with the table. Use `db.fn.sum`/`db.fn.count` + `groupBy`, and push every filter into `where`. `GET /projects/dashboard` (`projects/controllers/dashboard.ts`) buckets expenditures by month this way, via `to_char(date_trunc('month', spent_on), 'YYYY-MM')`, instead of pulling every row and grouping in JS.

**Check your new query has an index.** Filter, join and `ORDER BY` columns need one — Postgres does not index foreign keys for you. `project_memberships` and `project_donations` in particular have UNIQUE constraints whose *leading* column is not the one most queries filter on, so those don't help. Add the index in the same PR (see `db/README.md`).

## Validation

`projects` and `expenditures` have `validation-utils.ts` with static-method classes (`ProjectValidationUtils`, `ExpenditureValidationUtils`) returning either a `ValidationResult<T>` (`{ isValid, value?, error? }`) or an `Error` instance. Validate before DB writes; return `json(400, { message })` on failure. Integer params validated with `/^\d+$/` + positivity; dates with `/^\d{4}-\d{2}-\d{2}$/`.

## Pagination

Convention: optional `page` + `limit` query params → `offset = (page-1)*limit`. Response: `{ data: [...], pagination: { page, limit, totalItems, totalPages } }`. Absent params → return all.

## Testing

- `*.unit.test.ts` — mock `../auth` and (sometimes) `../db`; test routing/validation/authz branches. No DB needed.
- `*.e2e.test.ts` — `ensureSchema()` in `beforeAll` builds schema `branch` from `db/migrations` if stale; `resetData()` in `beforeEach` truncates with `RESTART IDENTITY` and re-applies `db/seed.sql` (so seeded ids stay 1-3 and created rows land on 4+). Both from `db/testkit.ts`. Mock only `authenticateRequest` to inject an auth context, hit the real handler against the real DB.
- Pattern: `jest.mock('../auth')` then `mockAuthenticateRequest.mockResolvedValueOnce(adminCtx)`. Build events with a `createEvent(method, path, body?, query?)` helper.
- Per-lambda scripts: `npm test` runs jest (some use `--forceExit`); `npm run test:e2e` / the `test` script use `start-server-and-test` against `/<service>/health` on port 3000. CI: `.github/workflows/lambda-tests.yml` spins up Postgres per lambda matrix.

## package.json scripts (per lambda)

```
dev      ts-node --transpile-only dev-server.ts
build    tsc
package  npm run build && cd dist && zip -r ../lambda.zip . -x '*.map' 'dev-server.*' 'swagger-utils.*'
test     jest (or start-server-and-test wrapping jest)
```

---

# Lambda CLI

When adding new API endpoints or scaffolding new Lambda handlers, use the CLI at `tools/lambda-cli.js`. Run all commands from this directory (`apps/backend/lambdas/`).

## Commands

### `init-handler <name>`
Creates a new Lambda handler with boilerplate (handler.ts, routes.ts, db.ts, dev-server.ts, openapi.yaml, swagger-utils.ts, package.json, tsconfig.json, README.md, test/). Wires in `@branch/types`, `@branch/lambda-auth` and `@branch/lambda-http` automatically. `routes.ts` starts empty; `controllers/` is created by the first `add-route`.

```bash
node tools/lambda-cli.js init-handler orders
```

### `add-route <handler> <METHOD> <path> [options]`
Inserts a table entry into `routes.ts` (between the ROUTES-START/ROUTES-END markers), scaffolds a stub `RouteHandler` in `controllers/<handler>.ts`, and appends a matching path block to `openapi.yaml`. `{param}` segments become `:param` in the table; `path` is prefixed with `<handler>` automatically if it isn't already (so `add-route auth POST /reset-password` and `add-route auth POST /auth/reset-password` produce the same route).

Options:
- `--body field:type,field:type` — request body fields
- `--query field:type,field:type` — query parameters
- `--headers field:type,field:type` — header parameters
- `--status <code>` — response status code (default: 200)

```bash
node tools/lambda-cli.js add-route auth POST /reset-password --body email:string,code:string,newPassword:string
node tools/lambda-cli.js add-route users GET /users/{id}
node tools/lambda-cli.js add-route users GET /users --query page:number,limit:number
node tools/lambda-cli.js add-route users POST /users --body name:string --headers authorization:string --status 201
```

### `list-routes <handler>`
Lists all routes declared in `routes.ts` (the table `dispatch()` actually executes — health/OPTIONS/404/500 aren't listed, since they're handled centrally, not table entries).

```bash
node tools/lambda-cli.js list-routes auth
```

### `generate-readme [handler]`
Generates/regenerates README.md for a handler. Omit handler name to regenerate all. (Also run by the `lambda-readme` CI workflow.)

```bash
node tools/lambda-cli.js generate-readme auth
node tools/lambda-cli.js generate-readme
```

## After using add-route

The CLI generates a stub controller function with `// TODO: Add your business logic here`. You must:
1. Replace the TODO stub with actual implementation
2. Update the generated OpenAPI spec in `openapi.yaml` with proper request/response schemas, descriptions, and status codes
