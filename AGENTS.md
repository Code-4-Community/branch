# AGENTS.md — BRANCH monorepo

BRANCH is a non-profit accounting platform (projects, donors, donations, expenditures, reports, users). Nx-managed monorepo: Next.js frontend + AWS Lambda backend microservices + Terraform infra + custom tooling + GitHub Actions automation.

> **Ignore two README.md files when learning the repo.** The root `README.md` is upstream `terraform-docs` boilerplate (not about BRANCH). `apps/frontend/README.md` is `create-next-app` boilerplate. Neither describes this project. AGENTS.md files are the source of truth.

> **Keep these docs current.** If a change alters architecture or an established convention — new/removed service or shared package, changed auth/data-access/routing pattern, new build/deploy/CI flow, renamed or moved key paths — update the relevant `AGENTS.md` in the **same PR**. These files are the source of truth for both humans and AI agents; stale docs are worse than none. Pure feature work that follows existing patterns does not need a doc change.

## Repo map

| Path | What | AGENTS.md |
|------|------|-----------|
| `apps/frontend/` | Next.js 15 app (App Router) | `apps/frontend/AGENTS.md` |
| `apps/frontend-e2e/` | Cypress e2e for frontend | — |
| `apps/backend/` | Docker-composed Lambda microservices + Postgres | `apps/backend/AGENTS.md` |
| `apps/backend/lambdas/` | The lambda services + `lambda-cli.js` tooling | `apps/backend/lambdas/AGENTS.md` |
| `shared/types/` | `@branch/types` — types-only pkg (DB rows + auth DTOs) | see backend doc |
| `shared/lambda-auth/` | `@branch/lambda-auth` — runtime Cognito auth/authz pkg | see backend doc |
| `infrastructure/` | Terraform: `aws/`, `github/`, `test/` | `infrastructure/AGENTS.md` |
| `.github/workflows/` | CI/CD + PR review bot | `.github/AGENTS.md` |

## Stack

- **Frontend:** Next.js 15.5 (App Router, Turbopack), React 19, Chakra UI v3 + Tailwind v4, JWT-in-localStorage auth.
- **Backend:** AWS Lambda (Node 20), TypeScript, Kysely + PostgreSQL, AWS Cognito auth. Each service is self-contained, deployed as `branch-{service}`.
- **Infra:** Terraform 1.13.0, state in S3 (`c4c-neu-terraform-state-files`) + DynamoDB lock, secrets via Infisical. Frontend is a static export on S3 + CloudFront (SPA); backend on Lambda + API Gateway; RDS Postgres 17.
- **Monorepo:** Nx 16 (nx-cloud cache). Per-app `package.json` (not a single workspace install) — backend lambdas and frontend each `npm ci` independently.

## Shared packages (critical)

Two `file:`-linked packages dedupe code across lambdas:

- **`@branch/types`** (`shared/types/`) — types only, no runtime. Exports DB row types (`DB`, `BranchUsers`, ...) + auth DTOs (`AuthContext`, `AuthenticatedUser`, `AccessLevel`, `AuthorizationCheck`). `db-types.d.ts` is **generated** from `apps/backend/db/db_setup.sql` by the `regenerate-db-types` workflow — never hand-edit it.
- **`@branch/lambda-auth`** (`shared/lambda-auth/`) — runtime auth: `authenticateRequest(db, event)`, `extractToken(event)`, `checkAuthorization(ctx, level, resourceUserId?)`. Lambdas wrap it in their local `auth.ts`.

## Root commands

```bash
npm run format        # prettier write (apps/{frontend,backend}/src)
npm run format:check
npm run lint          # eslint --fix frontend + backend
npm run lint:check
npm run prepush       # format:check + lint:check (husky)
```

Per-app build/test/dev commands live in each app's `package.json` and AGENTS.md. There is no top-level `build`/`test` — run them inside `apps/frontend` or per-lambda.

## Conventions

- TypeScript strict everywhere. Prettier + ESLint enforced on push (husky + lint-staged).
- Squash-merge only; 2 approvals required; PR merge queue. Branch protection requires `frontend-ci`, `lambda-tests`, `terraform-plan-summary` checks to pass.
- Schema changes go in `apps/backend/db/db_setup.sql`; DB types regenerate automatically via workflow.
- Don't commit secrets — all secrets flow through Infisical → GitHub Actions / Terraform.
