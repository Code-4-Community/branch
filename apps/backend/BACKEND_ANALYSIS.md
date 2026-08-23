# Backend Code Analysis Report

> **Date:** 2026-02-23
> **Scope:** `apps/backend/` — 6 Lambda microservices (users, projects, donors, expenditures, reports, auth), database schema, Docker infrastructure, and CLI tooling.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Critical Issues](#critical-issues)
4. [Code Duplication](#code-duplication)
5. [Security Concerns](#security-concerns)
6. [Inconsistent Patterns](#inconsistent-patterns)
7. [Testing Gaps](#testing-gaps)
8. [Database & Schema Issues](#database--schema-issues)
9. [Build, Packaging & DevOps](#build-packaging--devops)
10. [Recommendations Summary](#recommendations-summary)

---

## Executive Summary

The backend is a microservice architecture composed of 6 AWS Lambda functions (users, projects, donors, expenditures, reports, auth) backed by PostgreSQL and containerized with Docker for local development. The code is functional but exhibits several significant patterns that will impede maintainability, reliability, and security as the project grows.

**Key findings:**

| Category | Severity | Count |
|---|---|---|
| Security vulnerabilities | 🔴 High | 4 |
| Code duplication (copy-pasted files) | 🟠 Medium | 6 files × 6 services |
| Inconsistent API patterns | 🟠 Medium | 5 |
| Testing gaps | 🟡 Low–Medium | 4 |
| Package configuration issues | 🟡 Low | 5 |

---

## Architecture Overview

```
apps/backend/
├── docker-compose.yml          # Orchestrates all services
├── Makefile                    # Developer convenience commands
├── db/
│   ├── migrations/             # Schema migrations, applied in filename order
│   └── seed.sql                # Dev/test seed data
└── lambdas/
    ├── auth/                   # Authentication (Cognito + DB)
    ├── donors/                 # Donor management (read-only)
    ├── expenditures/           # Expenditure tracking (authed)
    ├── projects/               # Project CRUD
    ├── reports/                # Reports (stub, no routes)
    ├── users/                  # User CRUD
    └── tools/                  # CLI scaffolding tool
```

Each service is a standalone Node.js application with its own `package.json`, `Dockerfile`, database connection, type definitions, dev server, and Swagger utilities.

---

## Critical Issues

### 1. 🔴 Unsanitized User Input Passed Directly to Database (projects/handler.ts)

**File:** `lambdas/projects/handler.ts`, lines 33–38

```typescript
// PUT /projects/{id}
const body = event.body ? JSON.parse(event.body) as Record<string, {name:string, total_budget:number}> : {};
const updatedProject = await db
  .updateTable("branch.projects")
  .set(body)    // ← Arbitrary user input passed directly to .set()
  .where("project_id", "=", Number(id))
```

**Problem:** The entire parsed request body is passed to `.set(body)` without any validation or field whitelisting. An attacker could overwrite any column in the `projects` table, including `project_id` or `created_at`.

**Fix:** Whitelist allowed fields before passing to the database update.

---

### 2. 🔴 No Input Validation on PATCH /users (users/handler.ts)

**File:** `lambdas/users/handler.ts`, lines 95–118

```typescript
let email = body.email as string;
let name = body.name as string;
let isAdmin = body.isAdmin as boolean;

await db.updateTable('branch.users')
  .set({ email, name, is_admin: isAdmin })
  .where('user_id', '=', Number(userId))
  .execute();
```

**Problems:**
- No email format validation (unlike the auth service which validates email format).
- No type checking — `body.email` could be anything; the `as string` cast doesn't enforce types.
- All fields are set even if only one was provided in the request, potentially setting fields to `undefined`.
- No validation that `isAdmin` is actually a boolean.

---

### 3. 🔴 Debug Logging Left in Production Code (users/handler.ts)

**File:** `lambdas/users/handler.ts`, lines 17 and 69

```typescript
console.log('DEBUG - rawPath:', rawPath, 'normalizedPath:', normalizedPath, 'method:', method);
// ...
console.log(users);
```

These debug statements log raw request data and full database results. This can expose sensitive information in production logs.

---

### 4. 🔴 Missing `cognito_sub` in Users Service DB Types

**File:** `lambdas/users/db-types.d.ts`

The `BranchUsers` interface is missing the `cognito_sub` field that exists in the SQL schema and in the auth service's `db-types.d.ts`. This means the users service is working with an incomplete type definition, which could lead to data issues.

---

## Code Duplication

The most significant maintenance burden is the extensive copy-paste duplication across all 6 services.

### Identically Duplicated Files

| File | Copies | Lines per Copy | Notes |
|---|---|---|---|
| `db.ts` | 5 | 19 | Identical database connection setup |
| `db-types.d.ts` | 5 | ~78 | Generated types (mostly identical, except auth has `cognito_sub`) |
| `swagger-utils.ts` | 6 | 31 | Identical Swagger UI utility |
| `dev-server.ts` | 6 | ~175 | Identical local development server |
| `Dockerfile` | 6 | 15 | Near-identical (only health check path differs) |
| `tsconfig.json` | 6 | ~20 | Identical TypeScript config |
| `jest.config.js` | 6 | ~13 | Identical Jest config |
| `json()` function | 6 | 11 | Identical helper in every handler.ts |

**Total duplicated code: ~2,000+ lines that could be shared.**

### Recommendation

The `shared/` directory at the repository root exists but is empty. These common files should be extracted into a shared package:

```
shared/
├── db.ts                  # Single database connection module
├── db-types.d.ts          # Single type definitions file
├── swagger-utils.ts       # Swagger utilities
├── dev-server.ts          # Development server
├── response.ts            # json() helper + CORS headers
├── event-parser.ts        # Event normalization logic
├── tsconfig.base.json     # Base TypeScript config
└── jest.config.base.js    # Base Jest config
```

---

## Security Concerns

### 5. Wildcard CORS Headers

**All handlers** return:
```typescript
'Access-Control-Allow-Origin': '*'
```

This allows any website to make requests to the API. In production, this should be restricted to the actual frontend domain.

### 6. No OPTIONS Handler for CORS Preflight

None of the services handle `OPTIONS` requests. Browsers send `OPTIONS` preflight requests for cross-origin POST/PUT/PATCH/DELETE requests. Currently these return `404`, which means CORS preflight will fail in browser environments.

### 7. Hardcoded Default Credentials

**Files:** All `db.ts` files, test files, and `docker-compose.yml`

```typescript
user: process.env.DB_USER ?? 'branch_dev',
password: process.env.DB_PASSWORD ?? 'password',
```

While acceptable for local development, having `password` as a fallback password and hardcoded in multiple test files creates risk if code is accidentally deployed without proper environment variables.

### 8. No Rate Limiting

No services implement rate limiting. The auth service (`/register`, `/login`) is particularly vulnerable to brute-force attacks.

### 9. No Request Body Size Limits

No services enforce maximum request body size, making them vulnerable to denial-of-service via oversized payloads.

---

## Inconsistent Patterns

### 10. Response Format Varies Per Service

Each service returns data in a different shape:

| Service | Success Response Shape |
|---|---|
| **Users** (POST/PATCH/DELETE) | `{ ok, route, pathParams, body: { ... } }` |
| **Users** (GET /users) | `{ users: [...] }` |
| **Projects** (GET) | Raw array `[...]` |
| **Projects** (POST) | Raw object `{ project_id, name, ... }` |
| **Donors** (GET) | Raw array `[...]` |
| **Expenditures** (POST) | `{ ok, route, body: { ... } }` |

**Recommendation:** Adopt a consistent response envelope across all services, e.g.:
```json
{ "data": { ... }, "meta": { "timestamp": "..." } }
```

### 11. Inconsistent Path Matching Logic

Services use different approaches to match routes:

- **Users handler:** Checks `normalizedPath` for some routes, uses `normalizedPath.startsWith('/') && normalizedPath.split('/').length === 2` for parameterized routes.
- **Projects handler:** Checks `rawPath` for GET, but `normalizedPath` for POST.
- **Donors handler:** Checks `rawPath === '/'` for GET.
- **Expenditures handler:** Checks `normalizedPath` consistently.

This inconsistency makes it hard to reason about routing behavior and could lead to bugs.

### 12. Event Type Annotations

All handlers import `APIGatewayProxyEvent` but then type the event parameter as `any`:

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: any): Promise<APIGatewayProxyResult> => {
```

This defeats the purpose of TypeScript's type safety. A union type or custom event type should be defined.

### 13. Inconsistent Validation Approaches

| Service | Validation Approach |
|---|---|
| **Users** | Inline validation in handler |
| **Projects** | `ProjectValidationUtils` class with `ValidationResult<T>` return type |
| **Expenditures** | `ExpenditureValidationUtils` class with `Error` return type |
| **Auth** | Inline validation in handler |
| **Donors** | No validation (read-only) |

Two different validation patterns exist (returning `Error` objects vs. returning `ValidationResult` objects), and some services do validation inline. A unified validation approach should be adopted.

### 14. Inconsistent `let` vs `const` Usage

**Users handler (lines 105–107):**
```typescript
let email = body.email as string;
let name = body.name as string;
let isAdmin = body.isAdmin as boolean;
```

These should be `const` since they are never reassigned. The same pattern appears in the PATCH handler.

### 15. Duplicate ROUTES-END Markers (projects/handler.ts)

The projects handler has two `// <<< ROUTES-END` markers (lines 43 and 93), with the POST route placed between them. This means the CLI tool's route insertion logic could break.

---

## Testing Gaps

### 16. `jest` is a Production Dependency

**All `package.json` files** list `jest` under `dependencies` instead of `devDependencies`:

```json
"dependencies": {
  "jest": "^30.2.0",
  ...
}
```

This means jest and all its dependencies are included in production Lambda packages, increasing cold start time and package size.

### 17. Integration Tests Hardcode Connection Details

**Files:** `users/test/users.test.ts`, `projects/test/crud.test.ts`, `auth/test/auth.e2e.test.ts`, `expenditures/test/expenditures.e2e.test.ts`

```typescript
const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'branch_dev',
  password: 'password',
  database: 'branch_db',
});
```

These should use environment variables, consistent with how the application code handles configuration.

### 18. Missing Test Coverage

| Service | Unit Tests | Integration/E2E Tests | Notes |
|---|---|---|---|
| Users | ✅ POST only | ✅ CRUD | Missing unit tests for GET, PATCH, DELETE |
| Projects | ✅ POST validation | ✅ GET, PUT | Missing unit tests for GET, PUT |
| Donors | ❌ None | ❌ None | **No tests at all** |
| Expenditures | ✅ Good | ✅ Good | Best test coverage |
| Reports | ⚠️ Trivial | ❌ None | Only 1 health check test |
| Auth | ✅ Registration validation | ⚠️ Partial | Login/verify/resend/logout untested |

### 19. Projects Unit Test Hits Real Database

**File:** `lambdas/projects/test/projects.unit.test.ts`

This file is labeled as a "unit test" but doesn't mock the database — it connects directly to PostgreSQL. This means:
- Tests fail without a running database
- Tests are slow
- Tests are not isolated

---

## Database & Schema Issues

### 20. Destructive Schema Reset on Every Init — RESOLVED

`db/db_setup.sql` opened with `DROP SCHEMA IF EXISTS branch CASCADE;`, there was no
migration system, and nothing applied the schema to production at all (RDS was built
by hand).

**Resolved:** migrations are now plain `.sql` files in `db/migrations/`, applied by
kysely's `Migrator` and tracked in `branch.kysely_migration`. Locally:
`make new-migration NAME=x` → `make migrate`. In CI, the `migrate` job in
`lambda-deploy.yml` snapshots RDS and applies pending migrations on merge to main,
**before** the lambda zips deploy, so a failed migration blocks the code deploy. PR
gates (`migrations-fresh`, `migrations-guard`) reject destructive statements, edits to
already-merged migrations, and stale generated types. See `db/README.md`.

### 21. Missing Database Indexes — RESOLVED

The schema had eleven indexes, every one of them from a primary key or a unique
constraint and not one on a foreign key, so every lookup by `project_id`, every list
ordered by a date, and every `ON DELETE CASCADE` was a sequential scan.

**Resolved:** `db/migrations/20260812022651_add_access_pattern_indexes.sql` added seven
indexes covering the foreign keys and the date sorts — including the three this section
originally recommended, as composites where the query also sorts:
`expenditures (project_id, spent_on)`, `project_memberships (user_id)` and
`project_donations (project_id)`. A follow-up,
`20260823054531_add_followup_indexes.sql`, covers the sorts and the `status` filter that
migration left behind: `users (name)`, `expenditures (status, spent_on)` and
`project_donations (project_id, donation_id)` — the last of which supersedes and replaces
the single-column `project_donations (project_id)`.

Each index carries a comment naming the query it serves. Note `CREATE INDEX
CONCURRENTLY` cannot be used here: the migrator wraps the whole run in one transaction.

(The `email` column on `users` already has a unique constraint which creates an implicit index.)

### 22. No `updated_at` Column

Tables have `created_at` but no `updated_at` timestamp. This makes it impossible to track when records were last modified, which is important for auditing and caching.

---

## Build, Packaging & DevOps

### 23. All Package Names are `"lambda-local"`

Every service's `package.json` has `"name": "lambda-local"`. This causes confusion when debugging and makes it impossible to distinguish services in logs or dependency trees. They should be named descriptively (e.g., `"@branch/users-lambda"`).

### 24. Production Dockerfile Uses Dev Server

```dockerfile
CMD ["npm", "run", "dev"]  # runs ts-node dev-server.ts
```

The Dockerfile uses the development server command. For production Lambda deployment, the code should be compiled to JavaScript and bundled properly.

### 25. No Multi-Stage Docker Build

The Dockerfile copies all source files (including tests, dev dependencies) into the production image:

```dockerfile
COPY . .
```

A multi-stage build should be used to reduce image size and exclude unnecessary files.

### 26. Inconsistent Dependency Versions Across Services

| Dependency | Users | Projects | Donors | Expenditures | Auth |
|---|---|---|---|---|---|
| `pg` | ^8.16.3 | ^8.16.3 | ^8.17.2 | ^8.16.3 | ^8.17.2 |
| `kysely` | ^0.28.8 | ^0.28.8 | ^0.28.8 | ^0.28.8 | ^0.28.10 |
| `@types/pg` | ^8.15.5 | ^8.15.6 | ^8.16.0 | ^8.15.6 | ^8.16.0 |

Inconsistent versions can lead to subtle bugs and make upgrades harder.

### 27. `aws-lambda` Package in Expenditures Dependencies

**File:** `lambdas/expenditures/package.json`

```json
"dependencies": {
  "aws-lambda": "^1.0.7",  // ← This is a deprecated runtime package, not the types
}
```

This is likely a mistake. The `aws-lambda` npm package is a deprecated Lambda runtime and should not be used. Only `@types/aws-lambda` (in devDependencies) is needed.

### 28. Unused `dotenv` Dependency in Auth

**File:** `lambdas/auth/package.json`

`dotenv` is listed as a dependency but is never imported or used in any auth source file.

---

## Recommendations Summary

### Priority 1 — Security (Fix Immediately)

| # | Issue | Effort |
|---|---|---|
| 1 | Whitelist fields in PUT /projects `.set()` call | Small |
| 2 | Add input validation to PATCH /users | Small |
| 3 | Remove debug `console.log` statements from users handler | Trivial |
| 6 | Add OPTIONS handler for CORS preflight | Small |

### Priority 2 — Correctness & Reliability

| # | Issue | Effort |
|---|---|---|
| 4 | Sync `db-types.d.ts` across services (add `cognito_sub` to users) | Small |
| 10 | Standardize API response format | Medium |
| 11 | Standardize route matching logic | Medium |
| 15 | Fix duplicate ROUTES-END markers in projects | Trivial |

### Priority 3 — Code Quality & Maintainability

| # | Issue | Effort |
|---|---|---|
| Dup | Extract shared code into `shared/` package | Medium-Large |
| 12 | Define proper event types instead of `any` | Small |
| 13 | Unify validation approach across services | Medium |
| 14 | Fix `let` → `const` for immutable variables | Trivial |
| 16 | Move `jest` to `devDependencies` | Trivial |
| 23 | Give each service a unique package name | Trivial |

### Priority 4 — Testing & DevOps

| # | Issue | Effort |
|---|---|---|
| 17 | Use environment variables in test database connections | Small |
| 18 | Add tests for donors service and expand coverage | Medium |
| 19 | Mock database in projects "unit" tests | Small |
| 20 | ~~Implement database migration system~~ (done — `db/migrations/`, `db/README.md`) | Medium-Large |
| 24-25 | Fix Dockerfile for production use | Medium |
| 26 | Align dependency versions across services | Small |
