# AGENTS.md — backend

AWS Lambda microservices for BRANCH. Each service in `lambdas/<name>/` is self-contained, deploys to AWS Lambda as `branch-<name>`, and runs locally via Docker Compose or a shared dev-server. Data layer: Kysely + PostgreSQL (schema `branch`). Auth: AWS Cognito via `@branch/lambda-auth`.

See `lambdas/AGENTS.md` for the per-lambda code conventions and the `lambda-cli` scaffolding tool. This file covers the backend as a whole: services, local dev, DB, shared packages, deploy.

## Services

| Service | Port | Domain |
|---------|------|--------|
| postgres | 5432 | DB (schema applied by the one-shot `migrator` service from `db/migrations`) |
| users | 3001 | user management |
| projects | 3002 | projects, memberships, dashboard |
| donors | 3003 | donors + donations |
| expenditures | 3004 | expenditure tracking (approval workflow) |
| reports | 3005 | PDF/DOCX report generation → S3 |
| auth | 3006 | Cognito register/login/verify/reset (the auth provider) |

`pr-bot/` and `test-utils/` are empty placeholder dirs. The PR review bot is **not** a lambda — it runs as GitHub Actions (see `.github/AGENTS.md`).

## Local development

Two ways:

**Docker Compose (full stack)** — from `apps/backend/`:
```bash
make up          # build + start all services + postgres
make health      # curl /health on every service
make down-v      # stop + wipe db volume
make db-shell    # psql into branch_db
make logs-service SERVICE=users
```
Defaults work without `.env` (DB: branch_dev/password@postgres:5432/branch_db). See `apps/backend/README.md` for the full Make target table.

**Shared dev-server (single service iteration)** — from a lambda dir (`npm run dev`). All lambdas register on **port 3000**; first one started owns the server, others register via `POST /_register`. Routes dispatch by first path segment:
```
http://localhost:3000/auth/register
http://localhost:3000/donors            # GET /
http://localhost:3000/<service>/swagger # Swagger UI from openapi.yaml
http://localhost:3000/<service>/health
```

## Database

- Schema built from `db/migrations/*.sql` (Postgres schema `branch`); dev/test rows in `db/seed.sql`. Tables: `users`, `projects`, `project_memberships` (roles: Director/Student), `donors`, `project_donations`, `expenditures` (status: approved/pending/denied/needs_more_info), `reports` (report_type: technical/narrative), plus the unused `expenditure_rollup` and `project_rollup` (see below).
- **Production runs on Aurora DSQL** (local dev and CI run Postgres 16), so every migration must be DSQL-compatible: one DDL per file, `CREATE INDEX ${async}`, no SERIAL/triggers/PL/pgSQL/TRUNCATE, no bare `NUMERIC`. CI enforces it. See `db/README.md`.
- **Analytics are computed on read from the base tables** (`SUM`/`COUNT` over `expenditures`, `project_donations`, `reports`, `project_memberships`, filtered `deleted_at IS NULL`). There are no stored counters: a per-project counter row made every concurrent write to one project conflict on Aurora DSQL. `expenditure_rollup` and `project_rollup` are dead tables awaiting a drop migration; nothing reads them, and the store writes only a zeroed `project_rollup` row on `createProject`, because lambdas still on the old code fail a bump against a project with no row.
- **`@branch/store` (`shared/store`) is the only connection and the only writer.** It exports `db` (a read-only `Kysely<DB>`) and one named operation per write. Env `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`; a DSQL `DB_HOST` switches it to IAM-token auth with no password. Query with the `branch.` schema prefix: `db.selectFrom('branch.users')`.
- **Changing the schema:** `make new-migration NAME=add_thing` → write SQL → `make migrate` (applies it and regenerates `shared/types/db-types.d.ts`). `make show-migrations` shows applied vs pending; the ledger is `branch.flyway_schema_history`. Forward-only — never edit a merged migration, and never hand-edit `db-types.d.ts`. Migrations apply to prod automatically on merge **before** the lambda deploy, so a single PR may only contain additive changes; see `db/README.md` for expand/contract.
- **Deletes are soft.** `users`, `projects`, `donors`, `project_donations`, `expenditures` and `reports` carry a nullable `deleted_at`; every `remove*` in `@branch/store` stamps it instead of deleting (a project stamps its donations, expenditures and reports with the same time; a donor its donations). `project_memberships` is still hard-deleted, and a user delete still clears `expenditures.entered_by` as `ON DELETE SET NULL` did. **Every read of those six tables filters `deleted_at IS NULL`** — on a `leftJoin`, in the `ON` clause, so the parent row survives with null joined fields — and `shared/store/test/soft-delete-guard.test.ts` fails a query that forgets; each lambda's `soft-delete-parity.e2e.test.ts` proves its GETs read a soft-deleted row exactly like an absent one. The store's Kysely strips `deleted_at` from every result row, so responses never carry it. Inserts under a soft-deleted parent throw a `23503`, as the FK did. That parent check is `FOR KEY SHARE`, never `FOR UPDATE`: the `*_live_key` unique index on `(id, deleted_at)` makes the stamp a key update, so a delete conflicts with in-flight inserts while inserts never conflict with each other (`projects/test/soft-delete-concurrency.e2e.test.ts`). S3 objects and the row stay; the Cognito user is still deleted. There is no restore endpoint — recover by SQL (clear `deleted_at` on the row and its same-timestamp children, and re-add the memberships).
- The migration runner is Flyway over plain `.sql` files, configured once in `db/flyway.sh`; `db/src/` holds seeding, the schema rebuild and type generation. Root `package.json` still carries NestJS/TypeORM **dependencies** from the original scaffold, but nothing uses them; its dead `migration:*` scripts have been removed.

## Shared packages

All three linked via `file:` deps in each lambda's `package.json`:
- `@branch/types` (`../../../../shared/types`) — devDependency, types only. Must stay a dependency-free leaf: `@branch/lambda-auth` depends on it.
- `@branch/lambda-auth` (`../../../../shared/lambda-auth`) — dependency, runtime auth. Build it (`npm run build` in `shared/lambda-auth`) when its source changes; lambdas consume `dist/`. It depends on `@branch/types` and re-exports the auth DTOs from there, so those types have exactly one declaration; changing `shared/lambda-auth/package.json` deps invalidates every lambda's `package-lock.json`, so regenerate all six.
- `@branch/lambda-http` (`../../../../shared/lambda-http`) — dependency, runtime routing: `dispatch(event, { prefix, routes, resolveAuth })` plus `json`/`parseBody`/`requirePermission`/`createAuthResolver`. Every lambda's `handler.ts` is a 5-line call into it; each lambda's own `routes.ts` supplies the `Route[]` table, and every route in it declares a `permission` or an `access` level that dispatch enforces. Depends on `@branch/rbac`'s and `@branch/lambda-auth`'s `dist/`, so build those first. See `lambdas/AGENTS.md`.

## Deploy

Automatic on push to `main` touching `apps/backend/lambdas/**` or `shared/types/**` → `.github/workflows/lambda-deploy.yml`:
1. Detect changed lambdas (deploys all if none clearly detected).
2. Build per-lambda: `npm ci --legacy-peer-deps` + `npm run package` → `lambda.zip`.
3. `aws lambda update-function-code --function-name branch-<name>` (region `us-east-2`).

`npm run package` = `tsc` then zip `dist/` excluding maps, `dev-server.*`, `swagger-utils.*`. Function names **must** match `branch-<service>`. Infra (function definitions, IAM, API Gateway routes) is in `infrastructure/aws/lambda.tf` + `api_gateway.tf`; the deploy workflow only swaps code (TF `lifecycle` ignores `s3_key`).

## Env vars (lambdas)

`DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (or `COGNITO_APP_CLIENT_ID`), `REPORTS_BUCKET_NAME` (reports, expenditures and projects — one bucket holds both the `reports/` and `receipts/` prefixes; deletes leave the objects in place, see soft deletes below), `AWS_REGION` (default `us-east-2`, Lambda-reserved — never set it in Terraform).

**Anything a lambda reads from `process.env` must be declared in the `environment` block of `infrastructure/aws/lambda.tf`.** That block is authoritative and is deliberately not in `lifecycle.ignore_changes`, so a value set by hand in the console is deleted on the next apply. Locally the Cognito values must be the real shared dev-pool IDs (`apps/backend/.env`) — auth talks to the real pool for JWKS and `InitiateAuth` — but no AWS credentials are needed, because every Cognito API on the sign-in path is unsigned.

## Auth

`shared/lambda-auth` verifies the Bearer **access** token with `aws-jwt-verify`, then looks the caller up in `branch.users` by `cognito_sub`. A valid Cognito token whose sub has no DB row is treated as unauthenticated.

**`branch.users.is_admin` is the single source of truth for admin.** There is no promotion from a Cognito group, and no pre-token-generation trigger, so `is_admin` is not a JWT claim — `GET /auth/me` is the only way a client can learn it.

**Account provisioning is invitation-only.** A `branch.users` row with `cognito_sub IS NULL` is a pending invitation, created by `db/seed.sql` or by admin `POST /users` (ADMIN-gated). `POST /auth/register` is public, so it deliberately **cannot create a row** — it only claims an existing invitation, setting `cognito_sub` and never touching `is_admin`. An email with no pending invitation, or one already claimed, gets 403 `INVITATION_REQUIRED`.

The 403 is intentionally identical in both cases, so registration cannot be used to enumerate staff emails.

This is the real control, not the Cognito pool config: `authenticateRequest` rejects any Cognito identity whose `sub` has no `branch.users` row, so a Cognito user created out of band is inert. Full flow: admin `POST /users` → invitee `POST /auth/register` with that email → `POST /auth/verify-email` with the emailed code → `POST /auth/login`.

**Staff accounts** (`users.is_staff`) are hidden developer/support logins that can only switch into other users, from the frontend's `/staff` console. They are created by `make create-staff EMAIL=… NAME=…` and by nothing else: the script runs `AdminCreateUser`, then inserts the row via `@branch/store`'s `createStaffUser`. Run it against production with the DSQL `DB_HOST`, the pool's `COGNITO_USER_POOL_ID`, and credentials for the client account. Sessions, and every write made during them, are in `branch.impersonation_sessions` / `branch.impersonation_actions`.

**Bootstrapping the first admin** is a manual SQL statement in every environment, because `is_admin` can only be set by an existing admin: `make grant-admin EMAIL=…` locally, or the equivalent `UPDATE` against the DSQL cluster in production.

The auth lambda uses `USER_PASSWORD_AUTH` via the AWS SDK, not the SRP library. `POST /auth/login` returns either a token set or `{ ChallengeName, Session }`; `POST /auth/respond-challenge` completes it. Adding a challenge type is a row in `CHALLENGE_SPECS` — enabling MFA is a Terraform change, not a code change.
