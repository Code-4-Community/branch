# AGENTS.md — .github

CI/CD and PR automation. Two groups: **build/deploy** pipelines and the **PR review bot** (workflows + the `bot-state` branch; not a lambda). All bot workflows checkout `bot-state`, read Terraform-owned `config.json`, mutate `state.json` / `prs/{owner}_{repo}_{prNumber}.json`, and commit back (with push retries). Slack via `SLACK_BOT_TOKEN`.

## Build / test / deploy

| Workflow | Trigger | Does |
|----------|---------|------|
| `frontend-ci.yml` | PR to main/develop, merge_group | In `apps/frontend`: `npm ci` → typecheck → lint → build → test. **Required check `frontend-ci`.** |
| `lambda-tests.yml` | push/PR main/develop, merge_group | Discover lambdas (excl. `tools/`); matrix per lambda spins Postgres 16, seeds `db_setup.sql`, starts dev-server, health-checks, `npm test`. **Required check `lambda-tests`.** |
| `lambda-deploy.yml` | push to main, paths `apps/backend/lambdas/**` or `shared/types/**` | Detect changed lambdas (all if none); build `npm ci --legacy-peer-deps` + `npm run package` → `lambda.zip`; `aws lambda update-function-code --function-name branch-<name>` (us-east-2). |
| `frontend-deploy.yml` | push to main, paths `apps/frontend/**` | Build static export (`npm run build` → `out/`) with `NEXT_PUBLIC_API_BASE_URL`; `aws s3 sync` to the frontend bucket + CloudFront invalidation. `production` env, OIDC apply role. |
| `lambda-readme.yml` | after `terraform-plan` completes, or manual | `node tools/lambda-cli.js generate-readme` (all), commit regenerated READMEs. |
| `regenerate-db-types.yaml` | `db_setup.sql` changes, after `lambda-readme`, or manual | Spin Postgres, apply schema, `kysely-codegen`, strip kysely import → local `ColumnType`, write `shared/types/db-types.d.ts`, `tsc --noEmit`, commit to PR branch (or comment "in sync"). |
| `terraform-plan.yml` | PR main/develop, merge_group | Detect changed TF dirs; `fmt` + terraform-docs (auto-commit); per-dir `init`/`validate`/`plan`, post plan PR comment. **Required check `terraform-plan-summary`.** |
| `terraform-apply.yml` | push to main `infrastructure/**/*.tf`, or manual (dir list) | Per-dir matrix, `production` env (approval gate), `plan` → `apply -auto-approve`. |

Node 20 across pipelines (Node 23 for `regenerate-db-types`). AWS deploy/plan workflows assume OIDC IAM roles; Cognito/Infisical/Slack values are GitHub secrets provisioned by `infrastructure/github/secrets.tf`.

## PR review bot

State lives on the **`bot-state`** branch (provisioned by `infrastructure/github/review-bot.tf`):
- `config.json` (Terraform-owned): reviewer roster, GitHub→Slack ID map, always-reviewer, Slack channel, timezone.
- `state.json`: round-robin cursor. `prs/{owner}_{repo}_{prNumber}.json`: per-PR assignment, Slack message ts, status.

| Workflow | Trigger | Does |
|----------|---------|------|
| `pr-reviewer-assign.yml` | PR opened/ready/reopened (not draft) | Round-robin pick reviewer(s) skipping author (+ always-reviewer), request review, post Slack message, persist cursor + per-PR file. Idempotent. |
| `pr-review-status.yml` | review submitted (approved/changes_requested) | Recompute per-reviewer status, update Slack message + thread reply, DM author when all done, mark `reviewed`. |
| `pr-reviewer-remind.yml` | cron `0 */6 * * *`, or manual | For open PRs with pending reviewers and 36h+ since last reminder → Slack reminder; GC terminal PR files after 7 days. |
| `pr-closed.yml` | PR closed | Strikethrough Slack header, mark file `merged`/`closed`. |
| `merge-queue-dequeued.yml` | PR `dequeued` | DM author the dequeue reason. |

## Editing notes

- Adding a service: ensure `lambda-tests` discovery picks it up (lives under `lambdas/`, not `tools/`) and that an AWS function `branch-<name>` + API Gateway route exist (`infrastructure/aws`) for `lambda-deploy` to target.
- Changing required checks requires a matching update in `infrastructure/github/main.tf` branch protection.
- Bot logic edits: test against the `bot-state` `config.json` shape; never write `config.json` from a workflow (Terraform owns it).
