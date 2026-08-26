# BRANCH

A non-profit accounting platform — projects, donors, donations, expenditures,
reports, and user management. Built by [Code 4 Community](https://www.c4cneu.com/).

Nx-managed monorepo: a Next.js frontend, six AWS Lambda backend services, a
Postgres database, and Terraform-managed infrastructure.

## Stack

| Layer | What |
|---|---|
| Frontend | Next.js 15 (App Router, static export), React 19, Chakra UI v3 + Tailwind v4 |
| Backend | Six Node 20 Lambdas (`auth`, `donors`, `expenditures`, `projects`, `reports`, `users`), TypeScript, Kysely |
| Database | PostgreSQL 17 on RDS; SQL migrations run by CI before each deploy |
| Auth | AWS Cognito (invitation-only, optional TOTP MFA); authorization policy in `@branch/rbac` |
| Hosting | S3 + CloudFront for the frontend, API Gateway + Lambda for the API |
| Infra | Terraform 1.13, state in S3, secrets in Infisical |

## Quick start

Local development runs the backend under Docker Compose. You need Docker,
Docker Compose, and Make.

```bash
cd apps/backend
cp .env.example .env     # fill in the Cognito values, see below
make up                  # start postgres + all six services
make migrate             # apply migrations, seed, regenerate types
make health              # verify every service is answering
```

The frontend runs separately:

```bash
cd apps/frontend
npm ci
npm run dev
```

`COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` must be the real dev pool values —
there is no local Cognito emulator. Get them with:

```bash
cd infrastructure/aws && terraform output cognito_user_pool_id cognito_client_id
```

### First admin

`branch.users.is_admin` can only be set by an existing admin, so the first one in
any environment is bootstrapped in SQL:

```bash
cd apps/backend && make grant-admin EMAIL=you@example.com
```

Accounts are invitation-only: a `branch.users` row with `cognito_sub IS NULL` is a
pending invitation, and `POST /auth/register` claims it. A Cognito user created
out of band has no matching row and will be rejected.

## Documentation

`AGENTS.md` files are the source of truth, not README files. Start at the root
[`AGENTS.md`](AGENTS.md) for the repo map and conventions, then:

| Doc | Covers |
|---|---|
| [`apps/backend/AGENTS.md`](apps/backend/AGENTS.md) | Services, ports, auth model, env vars |
| [`apps/backend/db/README.md`](apps/backend/db/README.md) | Migration authoring rules and workflow |
| [`apps/frontend/AGENTS.md`](apps/frontend/AGENTS.md) | Frontend patterns and build model |
| [`shared/rbac/README.md`](shared/rbac/README.md) | The role/permission matrix |
| [`infrastructure/AGENTS.md`](infrastructure/AGENTS.md) | Terraform root modules and apply flow |
| [`.github/AGENTS.md`](.github/AGENTS.md) | CI/CD workflows and the PR review bot |

> `apps/frontend/README.md` is `create-next-app` boilerplate and does not describe
> this project.

## Deployment

Nothing is deployed by hand. Merging to `main` triggers:

- `terraform-apply` for infrastructure changes (gated on the `production` environment)
- `lambda-deploy` — builds the bundles, snapshots RDS, applies migrations, then
  updates function code
- `frontend-deploy` — builds the static export, syncs to S3, invalidates CloudFront

Pull requests get a `terraform-plan` comment, and adding the `test-environment`
label spins up an ephemeral per-PR preview stack.

## Contributing

Squash-merge only, one approval required, merge queue enabled. `frontend-ci`,
`lambda-tests`, and `terraform-plan-summary` must pass. Prettier and ESLint run on
push via husky.

Schema changes are always migrations — additive within a single PR, since
migrations apply to production before the new code deploys.
