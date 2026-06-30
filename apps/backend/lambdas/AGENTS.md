# AGENTS.md — lambdas

Each `<service>/` here is one Lambda. They share a near-identical shape. **Use the `lambda-cli` (below) to scaffold handlers and add routes** — it keeps `handler.ts` and `openapi.yaml` in sync. Hand-editing routes without it drifts the OpenAPI spec.

## Lambda anatomy

```
<service>/
  handler.ts        # entry: export const handler = async (event) => ...
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

```ts
export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    const rawPath = event.rawPath || event.path || '/';
    const normalizedPath = rawPath.replace(/\/$/, '');
    const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') return json(200, {});                  // CORS preflight
    if (normalizedPath.endsWith('/health') && method === 'GET')      // health (no auth)
      return json(200, { ok: true });

    const authContext = await authenticateRequest(event);            // every service except `auth`
    if (!authContext.isAuthenticated) return json(401, { message: 'Unauthorized' });

    // >>> ROUTES-START (do not remove this marker)
    if (normalizedPath === '/donors' && method === 'GET') { /* ... */ }
    // <<< ROUTES-END

    return json(404, { message: 'Not Found' });
  } catch (err) {
    console.error('Lambda error:', err);
    return json(500, { message: 'Internal Server Error' });
  }
};
```

- **NEVER remove or modify the `ROUTES-START` / `ROUTES-END` markers** — the CLI injects routes between them.
- Handles both API Gateway and Lambda Function URL event shapes (`rawPath`/`path`, `requestContext.http.method`/`httpMethod`).
- Responses go through a local `json(status, body)` helper that sets CORS headers (`Access-Control-Allow-Origin: *`, allowed headers `Content-Type,Authorization`).

## Auth & authorization

Generic logic lives in `@branch/lambda-auth`; each lambda's `auth.ts` binds it to the local `db`:
```ts
import { authenticateRequest as _authenticateRequest } from '@branch/lambda-auth';
import db from './db';
export * from '@branch/lambda-auth';
export async function authenticateRequest(event: any) {
  return _authenticateRequest(db, event);
}
```
- `authenticateRequest(event)` → `AuthContext` (`{ isAuthenticated, user? }`). Verifies the Cognito access token, looks the user up by `cognito_sub`, sets `isAdmin` (true if `is_admin` or in Cognito `Admins` group).
- `checkAuthorization(ctx, level, resourceUserId?)` → `{ allowed, reason? }`. Levels: `PUBLIC`, `AUTHENTICATED`, `ADMIN`, `SELF`, `ADMIN_OR_SELF`. Used by `users` (e.g. via a local `requireAuth` wrapper returning a 401/403 response or `undefined`).
- **Domain authz** stays local: e.g. `projects/auth.ts` adds `canAccessProject`, `canEditProject` (roles PI/Accountant/Admin), `canCreateProject` (admin only). Add new project/resource checks here, not in the shared package.

## DB access

`db.ts` exports a `Kysely<DB>` (`DB` from `@branch/types`) over a `pg.Pool`. Always qualify the schema:
```ts
await db.selectFrom('branch.users').where('cognito_sub', '=', sub).selectAll().executeTakeFirst();
await db.selectFrom('branch.users').select(db.fn.count('user_id').as('count')).executeTakeFirst();
```

## Validation

`projects` and `expenditures` have `validation-utils.ts` with static-method classes (`ProjectValidationUtils`, `ExpenditureValidationUtils`) returning either a `ValidationResult<T>` (`{ isValid, value?, error? }`) or an `Error` instance. Validate before DB writes; return `json(400, { message })` on failure. Integer params validated with `/^\d+$/` + positivity; dates with `/^\d{4}-\d{2}-\d{2}$/`.

## Pagination

Convention: optional `page` + `limit` query params → `offset = (page-1)*limit`. Response: `{ data: [...], pagination: { page, limit, totalItems, totalPages } }`. Absent params → return all.

## Testing

- `*.unit.test.ts` — mock `../auth` and (sometimes) `../db`; test routing/validation/authz branches. No DB needed.
- `*.e2e.test.ts` — seed Postgres from `db_setup.sql`, mock only `authenticateRequest` to inject an auth context, hit the real handler against the real DB.
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
Creates a new Lambda handler with boilerplate (handler.ts, dev-server.ts, openapi.yaml, swagger-utils.ts, package.json, tsconfig.json, README.md, test/). Wires in `@branch/types` and `@branch/lambda-auth` automatically.

```bash
node tools/lambda-cli.js init-handler orders
```

### `add-route <handler> <METHOD> <path> [options]`
Adds a route stub to both `handler.ts` (between the ROUTES-START/ROUTES-END markers) and `openapi.yaml`.

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
Lists all routes defined in a handler (from both handler.ts and openapi.yaml).

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

The CLI generates stub code with `// TODO: Add your business logic here`. You must:
1. Replace the TODO stub with actual implementation
2. Update the generated OpenAPI spec in `openapi.yaml` with proper request/response schemas, descriptions, and status codes
