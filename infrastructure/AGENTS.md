# AGENTS.md — infrastructure

Terraform for BRANCH. Five independent root modules, each with its own S3-backed state. **Do not run `terraform apply` by hand** — apply/plan happen through GitHub Actions (`terraform-plan` on PRs, `terraform-apply` on push to `main`). Secrets come from Infisical, never hardcoded.

The one exception is bootstrapping a new AWS account: CI assumes `branch-ci-apply`, which `aws/` itself creates, so the first apply in an empty account has to be local with admin credentials.

Common to all modules: Terraform **1.13.0** (`.terraform-version`, tfenv), state in S3 bucket `c4c-neu-terraform-state-files` (region `us-east-2`, DynamoDB lock table `terraform-state-lock`, encrypted). Infisical workspace `d1ee8b80-118c-4daf-ae84-31da43261b76`.

## Modules

### `aws/` (state key `aws/terraform.tfstate`)
Application infra. Providers: AWS 6.14.1, Infisical.
- `main.tf` — RDS PostgreSQL 17.9 (db.t3.micro), `branch_rds` db; creds from Infisical `/aws/rds`.
- `lambda.tf` — 6 Lambda functions (auth/donors/expenditures/projects/reports/users, Node 20.x, 256MB, 30s), IAM role (CloudWatch Logs + pool-scoped `cognito-idp:AdminDeleteUser`/`AdminGetUser` for the registration-rollback and `DELETE /users/{userId}` paths + `s3:PutObject`/`s3:GetObject` on the reports bucket), deployment S3 bucket. **`lifecycle` ignores `s3_key` only** — code is deployed by CI (`lambda-deploy`), not Terraform. Env: `NODE_ENV`, `DB_*`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `REPORTS_BUCKET_NAME`, `NODE_OPTIONS`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`. Attaches the Sentry layer (`modules/sentry`); the SDK lives only in that layer, never in the bundles, and `NODE_OPTIONS` is what activates it — drop either and errors stop reporting with no other symptom. `SENTRY_DSN` comes from Infisical `/sentry` (`sentry-dsn`) and `OTEL_EXPORTER_OTLP_HEADERS` from `/grafana`, not the tree. **The `environment` block is authoritative:** any var set by hand in the console and not declared here is deleted on the next apply, which previously took out authentication across all six lambdas. `AWS_REGION` is Lambda-reserved and must stay absent.
- `cognito.tf` — user pool (email sign-in, auto-verify, 8-char password policy, `advanced_security_mode = AUDIT`, `mfa_configuration = OPTIONAL` with `software_token_mfa_configuration { enabled = true }`, deletion protection) + public client (1h access/ID tokens, 30d refresh, no secret). Outputs `cognito_user_pool_id` / `cognito_client_id`; the lambdas get these from `lambda.tf` directly, no manual step. Infisical `/aws/cognito/` is still the source for the `COGNITO_*` GitHub Actions secrets used by `lambda-tests.yml` — keep it in sync if the pool is ever recreated. Threat protection is AUDIT rather than ENFORCED because every sign-in is proxied through the auth lambda, so adaptive auth would risk-score one shared ENI address. TOTP MFA is opt-in per user (`POST /auth/mfa-setup`/`/mfa-verify`/`/mfa-disable` in the auth lambda) — never forced at login.
- `api_gateway.tf` — REST API, one resource per lambda, method routing, `AWS_PROXY` integration, `prod` stage.
- `s3.tf` — private reports bucket + versioned/encrypted lambda-deployments bucket. The reports bucket was public-read until the lambda role gained `s3:GetObject`; reports are now served only through the presigned `GET /reports/{id}/download`, so nothing may reintroduce a public bucket policy.
- `frontend_hosting.tf` — static frontend: private S3 bucket + CloudFront (OAC) with an SPA fallback (403/404 → `/index.html`) and an index-rewrite CloudFront Function. The Next.js app is exported (`output: 'export'`) and synced to S3 by the `frontend-deploy` workflow.
- `oidc.tf` — GitHub OIDC provider + `branch-ci-plan` (read-only) / `branch-ci-apply` (write, `production` env only) roles for CI.
- `secrets.tf`, `variables.tf` — Infisical data sources (`/aws/rds`, `/sentry`, `/grafana`).

### `github/` (state key `github/terraform.tfstate`)
Repo + automation config. Providers: integrations/github ~6.6, Infisical.
- `main.tf` — repo settings (squash-only, auto-merge, delete-branch-on-merge, merge queue, vuln alerts), main branch protection (required checks: `terraform-plan-summary`, `lambda-tests`, `frontend-ci`; 1 approval, code-owner review not required, `nourshoreibah` can bypass PR review requirements), collaborators.
- `review-bot.tf` — provisions the **`bot-state` branch** used by the PR review bot. Terraform owns `config.json` (reviewer roster, GitHub→Slack mappings, always-reviewer, Slack channel, timezone). The bot owns `state.json` (round-robin cursor) and `prs/*.json` (per-PR tracking) — TF does not manage those. Lightweight branch protection (no force-push/delete, no approval needed for bot pushes).
- `secrets.tf` — GitHub Actions secrets synced from Infisical (`INFISICAL_*`, `GH_PAT`, `COGNITO_*`, `SLACK_BOT_TOKEN`), plus the `AWS_ACCOUNT_ID` Actions **variable** (from `var.aws_account_id`) that every workflow role ARN interpolates. AWS access in CI uses OIDC roles (`infrastructure/aws/oidc.tf`), not static keys.
- `variables.tf` — roster + Slack mapping values.

### `test/` (state key `test/terraform.tfstate`)
Empty — `main.tf` declares no resources. Kept only for its backend/provider config; CI integration tests use a `postgres:16` service container (`lambda-tests.yml`), not a real instance.

### `modules/` (shared, no state of its own)
Output-only helpers consumed by the roots: `tags` (the `Project = branch` default tag) and `sentry` (layer ARN + `NODE_OPTIONS`, pinned in one place so `aws/` and `preview/` cannot drift). Bumping the SDK is a version bump on the ARN here; the layer is region-pinned to `us-east-2`. The DSN is deliberately **not** in this module — the repo is public, so it lives in Infisical `/sentry` and only `aws/` reads it; `preview/` inherits it through `var.lambda_env`.

## Apply / plan flow

- **PR** touching `*.tf`/`*.tfvars`/`.terraform-version` → `terraform-plan.yml`: detects changed dirs, runs `terraform fmt -recursive` + terraform-docs (auto-commits formatting + README), `init`/`validate`/`plan`, posts plan as a PR comment. Gate check: `terraform-plan-summary`.
- **Push to `main`** touching `infrastructure/**/*.tf` → `terraform-apply.yml`: per-dir matrix, `production` environment (approval gate), `plan` then `apply -auto-approve`. Also dispatchable manually with a comma-separated dir list.
- READMEs in each module are auto-generated by terraform-docs (BEGIN/END markers) — don't hand-edit the generated tables.

## PR review bot ↔ infra

The bot is **GitHub Actions + the `bot-state` branch**, not a lambda. `review-bot.tf` seeds/protects the branch and config; `secrets.tf` injects `SLACK_BOT_TOKEN`. Bot workflow logic is in `.github/workflows/pr-*.yml` (see `.github/AGENTS.md`).
