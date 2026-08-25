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

- Schema built from `db/migrations/*.sql` (Postgres schema `branch`); dev/test rows in `db/seed.sql`. Tables: `users`, `projects`, `project_memberships` (roles: Director/Student), `donors`, `project_donations`, `expenditures` (status: approved/pending/denied/needs_more_info), `reports` (report_type: technical/narrative), plus the rollups `expenditure_rollup` and `project_rollup`.
- **The rollups are trigger-maintained, so they are exact, not stale.** `expenditure_rollup` (project × month × category × status) and `project_rollup` (per-project counts + `total_donated`) are kept in step by row triggers plus `AFTER TRUNCATE` statement triggers; spend lives only in `expenditure_rollup`. Editing the triggers: increments upsert, decrements are a plain `UPDATE` (cascade-delete order is undefined, so a zero-row `UPDATE` must be a safe no-op).
- Schema built from `db/migrations/*.sql` (Postgres schema `branch`); dev/test rows in `db/seed.sql`. Tables: `users`, `projects`, `project_memberships` (roles: Director/Student), `donors`, `project_donations`, `expenditures` (status: approved/pending/denied/needs_more_info), `reports` (report_type: technical/narrative), plus the trigger-maintained rollups `expenditure_rollup` and `project_rollup`.
- **Analytics reads go through the rollups, never the base tables.** `expenditure_rollup` (grain: project × month × category × status) and `project_rollup` (per project: member/donation/report counts and `total_donated`) are maintained by `AFTER INSERT OR UPDATE OR DELETE` row triggers, so they are exact rather than eventually consistent — there is nothing to refresh and no scheduler. Spend lives **only** in `expenditure_rollup`; do not add a `total_spent` column to `project_rollup`. Two rules when touching the triggers: increments upsert, decrements are a plain `UPDATE` (a project cascade-delete reaches `expenditures` and the rollups in an undefined order, so a zero-row `UPDATE` must be a safe no-op), and emptied buckets are left at zero rather than deleted. `TRUNCATE` fires no row triggers, so each base table also has an `AFTER TRUNCATE ... FOR EACH STATEMENT` trigger — a new base table needs both kinds. Time-relative figures (the active-project count, "spend on active projects") cannot be rolled up and still read `projects` live.
- Kysely connects via `db.ts` in each lambda (`Kysely<DB>` + `pg.Pool`, env `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`). Query with the `branch.` schema prefix: `db.selectFrom('branch.users')`.
- **Changing the schema:** `make new-migration NAME=add_thing` → write SQL → `make migrate` (applies it and regenerates `shared/types/db-types.d.ts`). `make show-migrations` shows applied vs pending; the ledger is `branch.kysely_migration`. Forward-only — never edit a merged migration, and never hand-edit `db-types.d.ts`. Migrations apply to prod automatically on merge **before** the lambda deploy, so a single PR may only contain additive changes; see `db/README.md` for expand/contract.
- The migration runner is kysely's `Migrator` over plain `.sql` files (`db/src/`). Root `package.json` still carries NestJS/TypeORM **dependencies** from the original scaffold, but nothing uses them; its dead `migration:*` scripts have been removed.

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

`DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (or `COGNITO_APP_CLIENT_ID`), `REPORTS_BUCKET_NAME` (reports, expenditures and projects — one bucket holds both the `reports/` and `receipts/` prefixes, and all three delete out of it), `AWS_REGION` (default `us-east-2`, Lambda-reserved — never set it in Terraform).

**Anything a lambda reads from `process.env` must be declared in the `environment` block of `infrastructure/aws/lambda.tf`.** That block is authoritative and is deliberately not in `lifecycle.ignore_changes`, so a value set by hand in the console is deleted on the next apply. Locally the Cognito values must be the real shared dev-pool IDs (`apps/backend/.env`) — auth talks to the real pool for JWKS and `InitiateAuth` — but no AWS credentials are needed, because every Cognito API on the sign-in path is unsigned.

## Auth

`shared/lambda-auth` verifies the Bearer **access** token with `aws-jwt-verify`, then looks the caller up in `branch.users` by `cognito_sub`. A valid Cognito token whose sub has no DB row is treated as unauthenticated.

**`branch.users.is_admin` is the single source of truth for admin.** There is no promotion from a Cognito group, and no pre-token-generation trigger, so `is_admin` is not a JWT claim — `GET /auth/me` is the only way a client can learn it.

**Account provisioning is invitation-only.** A `branch.users` row with `cognito_sub IS NULL` is a pending invitation, created by `db/seed.sql` or by admin `POST /users` (ADMIN-gated). `POST /auth/register` is public, so it deliberately **cannot create a row** — it only claims an existing invitation, setting `cognito_sub` and never touching `is_admin`. An email with no pending invitation gets 403 `INVITATION_REQUIRED`; an already-claimed one gets 409.

The 403 is intentionally identical whether or not the address exists, so registration cannot be used to enumerate staff emails.

This is the real control, not the Cognito pool config: `authenticateRequest` rejects any Cognito identity whose `sub` has no `branch.users` row, so a Cognito user created out of band is inert. Full flow: admin `POST /users` → invitee `POST /auth/register` with that email → `POST /auth/verify-email` with the emailed code → `POST /auth/login`.

**Bootstrapping the first admin** is a manual SQL statement in every environment, because `is_admin` can only be set by an existing admin: `make grant-admin EMAIL=…` locally, or the equivalent `UPDATE` against RDS in production.

The auth lambda uses `USER_PASSWORD_AUTH` via the AWS SDK, not the SRP library. `POST /auth/login` returns either a token set or `{ ChallengeName, Session }`; `POST /auth/respond-challenge` completes it. Adding a challenge type is a row in `CHALLENGE_SPECS` — enabling MFA is a Terraform change, not a code change.
