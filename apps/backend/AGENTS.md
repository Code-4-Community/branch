# AGENTS.md — backend

AWS Lambda microservices for BRANCH. Each service in `lambdas/<name>/` is self-contained, deploys to AWS Lambda as `branch-<name>`, and runs locally via Docker Compose or a shared dev-server. Data layer: Kysely + PostgreSQL (schema `branch`). Auth: AWS Cognito via `@branch/lambda-auth`.

See `lambdas/AGENTS.md` for the per-lambda code conventions and the `lambda-cli` scaffolding tool. This file covers the backend as a whole: services, local dev, DB, shared packages, deploy.

## Services

| Service | Port | Domain |
|---------|------|--------|
| postgres | 5432 | DB (schema auto-init from `db/db_setup.sql`) |
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

- Schema in `db/db_setup.sql` (schema `branch`, with seed data). Tables: `users`, `projects`, `project_memberships` (roles: PI/Accountant/Staff/Admin), `donors`, `project_donations`, `expenditures` (status: approved/pending/denied/needs_more_info), `reports` (report_type: technical/narrative).
- Kysely connects via `db.ts` in each lambda (`Kysely<DB>` + `pg.Pool`, env `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`). Query with the `branch.` schema prefix: `db.selectFrom('branch.users')`.
- **Changing the schema:** edit `db_setup.sql`. The `regenerate-db-types` workflow regenerates `shared/types/db-types.d.ts` (via `kysely-codegen`) on push. Never hand-edit `db-types.d.ts`.
- Root `package.json` has TypeORM migration scripts (`migration:generate` etc.) — legacy NestJS scaffolding, **not** used by the lambdas. Lambdas use Kysely + the raw SQL setup file.

## Shared packages

Both linked via `file:` deps in each lambda's `package.json`:
- `@branch/types` (`../../../../shared/types`) — devDependency, types only.
- `@branch/lambda-auth` (`../../../../shared/lambda-auth`) — dependency, runtime auth. Build it (`npm run build` in `shared/lambda-auth`) when its source changes; lambdas consume `dist/`.

## Deploy

Automatic on push to `main` touching `apps/backend/lambdas/**` or `shared/types/**` → `.github/workflows/lambda-deploy.yml`:
1. Detect changed lambdas (deploys all if none clearly detected).
2. Build per-lambda: `npm ci --legacy-peer-deps` + `npm run package` → `lambda.zip`.
3. `aws lambda update-function-code --function-name branch-<name>` (region `us-east-2`).

`npm run package` = `tsc` then zip `dist/` excluding maps, `dev-server.*`, `swagger-utils.*`. Function names **must** match `branch-<service>`. Infra (function definitions, IAM, API Gateway routes) is in `infrastructure/aws/lambda.tf` + `api_gateway.tf`; the deploy workflow only swaps code (TF `lifecycle` ignores `s3_key`).

## Env vars (lambdas)

`DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (or `COGNITO_APP_CLIENT_ID`), `AWS_REGION` (default `us-east-2`).
