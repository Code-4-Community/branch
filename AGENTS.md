# AGENTS.md — BRANCH monorepo

BRANCH is a non-profit accounting platform (projects, donors, donations, expenditures, reports, users). Nx-managed monorepo: Next.js frontend + AWS Lambda backend microservices + Terraform infra + custom tooling + GitHub Actions automation.

> **Ignore `apps/frontend/README.md`** — it is `create-next-app` boilerplate and does not describe this project. The root `README.md` is real but intentionally shallow (orientation + quick start); AGENTS.md files remain the source of truth.

> **Keep these docs current.** If a change alters architecture or an established convention — new/removed service or shared package, changed auth/data-access/routing pattern, new build/deploy/CI flow, renamed or moved key paths — update the relevant `AGENTS.md` in the **same PR**. These files are the source of truth for both humans and AI agents; stale docs are worse than none. Pure feature work that follows existing patterns does not need a doc change.

## Repo map

| Path | What | AGENTS.md |
|------|------|-----------|
| `apps/frontend/` | Next.js 15 app (App Router) | `apps/frontend/AGENTS.md` |
| `apps/frontend-e2e/` | Cypress e2e for frontend | — |
| `apps/backend/` | Docker-composed Lambda microservices + Postgres | `apps/backend/AGENTS.md` |
| `apps/backend/lambdas/` | The lambda services + `lambda-cli.js` tooling | `apps/backend/lambdas/AGENTS.md` |
| `shared/types/` | `@branch/types` — types-only pkg (DB rows + auth DTOs) | see backend doc |
| `shared/rbac/` | `@branch/rbac` — **the** authorization policy, shared by lambdas + frontend | `shared/rbac/README.md` |
| `shared/lambda-auth/` | `@branch/lambda-auth` — runtime Cognito auth/authz pkg | see backend doc |
| `shared/lambda-http/` | `@branch/lambda-http` — route table, dispatch, permission enforcement | see backend doc |
| `infrastructure/` | Terraform: `aws/`, `github/`, `preview/`, `preview-shared/`, `test/` | `infrastructure/AGENTS.md` |
| `.github/workflows/` | CI/CD + PR review bot | `.github/AGENTS.md` |

## Stack

- **Frontend:** Next.js 15.5 (App Router, Turbopack), React 19, Chakra UI v3 + Tailwind v4, JWT-in-localStorage auth.
- **Backend:** AWS Lambda (Node 20), TypeScript, Kysely + PostgreSQL, AWS Cognito auth. Each service is self-contained, deployed as `branch-{service}`.
- **Infra:** Terraform 1.13.0, state in S3 (`c4c-neu-terraform-state-files`) + DynamoDB lock, secrets via Infisical. Frontend is a static export on S3 + CloudFront (SPA); backend on Lambda + API Gateway; RDS Postgres 17.
- **Monorepo:** Nx 16 (nx-cloud cache). Per-app `package.json` (not a single workspace install) — backend lambdas and frontend each `npm ci` independently.

## Shared packages (critical)

Four `file:`-linked packages dedupe code across the repo:

- **`@branch/types`** (`shared/types/`) — types only, no runtime. Exports DB row types (`DB`, `BranchUsers`, ...) + auth DTOs (`AuthContext`, `AuthenticatedUser`, `AccessLevel`, `AuthorizationCheck`). It is the **single declaration** of those DTOs: `@branch/lambda-auth` depends on this package and re-exports them, so never add a second copy anywhere. `db-types.d.ts` is **generated** from `apps/backend/db/migrations/**` by the `Schema Change Checks` workflow (or locally by `make types`) — never hand-edit it.
- **`@branch/rbac`** (`shared/rbac/`) — the authorization policy, as one table of rules plus a pure `can`/`authorize`. **The lambdas and the frontend both evaluate this module**, so a disabled button and the 403 behind it cannot disagree. It is the only place a permission is defined; do not re-derive one from `isAdmin` in a component or a controller. Read `shared/rbac/README.md` — it carries the role matrix — before changing who may do what.
- **`@branch/lambda-auth`** (`shared/lambda-auth/`) — runtime auth: `authenticateRequest(db, event)`, `extractToken(event)`, `loadRbacSubject(db, ctx)` (one query for the caller's memberships, which is also what `GET /auth/me` ships to the browser). Lambdas wrap it in their local `auth.ts`.
- **`@branch/lambda-http`** (`shared/lambda-http/`) — runtime routing: `dispatch(event, { prefix, routes, resolveAuth })` replaces the old per-lambda if-chain handler with a declarative `Route[]` table (`routes.ts`). Every route declares `access: 'public' | 'authenticated'` or a `permission`, and dispatch enforces it before the controller runs; the union has no default arm, so omitting the gate is a type error. Also exports `json`, `parseBody`, `requirePermission`, `createAuthResolver`. Depends on `@branch/rbac`'s and `@branch/lambda-auth`'s `dist/`, so build those first (`.github/actions/build-shared-packages` does it in order). See `apps/backend/lambdas/AGENTS.md`.

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
- Squash-merge only; 1 approval required; PR merge queue. Branch protection requires `frontend-ci`, `lambda-tests`, `terraform-plan-summary` checks to pass.
- Schema changes are migrations: `make new-migration NAME=x` in `apps/backend`, write SQL, `make migrate`. Applied to prod automatically on merge, before the lambda deploy — so additive changes only in a single PR. See `apps/backend/db/README.md`.
- Don't commit secrets — all secrets flow through Infisical → GitHub Actions / Terraform.
