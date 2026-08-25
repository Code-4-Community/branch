# AGENTS.md — .github

CI/CD and PR automation. Two groups: **build/deploy** pipelines and the **PR review bot** (workflows + the `bot-state` branch; not a lambda). All bot workflows checkout `bot-state`, read Terraform-owned `config.json`, mutate `state.json` / `prs/{owner}_{repo}_{prNumber}.json`, and commit back (with push retries). Slack via `SLACK_BOT_TOKEN`.

## Build / test / deploy

| Workflow | Trigger | Does |
|----------|---------|------|
| `frontend-ci.yml` | PR to main/develop, merge_group | In `apps/frontend`: `npm ci` → typecheck → lint → build → test. **Required check `frontend-ci`.** Cancels superseded runs on the same PR/ref. |
| `lambda-tests.yml` | push/PR main/develop, merge_group | Hardcoded 6-way matrix (one job per lambda) spins Postgres 16, applies `db/migrations` + `db/seed.sql`, starts dev-server, health-checks, `npm test`. A single `checks` job runs migration guards, shared-package tests, and from-scratch migrate+types. **Required check `lambda-tests`.** Cancels superseded runs on the same PR/ref. |
| `lambda-deploy.yml` | push to main, paths `apps/backend/lambdas/**` or `shared/types/**` | Detect changed lambdas (all if none); build `npm ci --legacy-peer-deps` + `npm run package` → `lambda.zip`; `aws lambda update-function-code --function-name branch-<name>` (us-east-2). |
| `frontend-deploy.yml` | push to main, paths `apps/frontend/**` | Build static export (`npm run build` → `out/`) with `NEXT_PUBLIC_API_BASE_URL`; `aws s3 sync` to the frontend bucket + CloudFront invalidation. `production` env, OIDC apply role. |
| `lambda-readme.yml` | PR/push that touches `apps/backend/lambdas/**` (not README-only), or manual | `node tools/lambda-cli.js generate-readme` (all), commit regenerated READMEs. Cancels superseded runs. |
| `regenerate-db-types.yaml` (`Schema Change Checks`) | `db/migrations/**` changes, or manual | Post a sticky migration checklist comment, spin Postgres, apply migrations, run `npm run types` (shared code path with local `make types`), `tsc --noEmit`, commit to PR branch (or comment "in sync"). |
| `terraform-plan.yml` | PR main/develop, merge_group | Detect changed TF dirs; `fmt` + terraform-docs (auto-commit); per-dir `init`/`validate`/`plan`, post plan PR comment. **Required check `terraform-plan-summary`.** |
| `terraform-apply.yml` | push to main `infrastructure/**/*.tf`, or manual (dir list) | Per-dir matrix, `production` env (approval gate), `plan` → `apply -auto-approve`. |

Node 20 across pipelines (Node 23 for `regenerate-db-types`). AWS deploy/plan workflows assume OIDC IAM roles; Cognito/Infisical/Slack values are GitHub secrets provisioned by `infrastructure/github/secrets.tf`.

## PR review bot

State lives on the **`bot-state`** branch (provisioned by `infrastructure/github/review-bot.tf`):
- `config.json` (Terraform-owned): reviewer roster, GitHub→Slack ID map, always-reviewer, Slack channel, timezone.
- `state.json`: round-robin cursor. `prs/{owner}_{repo}_{prNumber}.json`: per-PR assignment, Slack message ts, status.

| Workflow | Trigger | Does |
|----------|---------|------|
| `pr-reviewer-assign.yml` | PR opened/ready/reopened/unlabeled (not draft, not `no-review`) | Round-robin pick reviewer(s) skipping author (+ always-reviewer), request review, post Slack message, persist cursor + per-PR file. Idempotent. |
| `pr-review-status.yml` | review submitted (approved/changes_requested) | Recompute per-reviewer status, update Slack message + thread reply, DM author when at least one reviewer approves (and no active changes-requested state), mark `reviewed` when approval requirement is met or all reviewers finish. |
| `pr-reviewer-remind.yml` | cron `0 */6 * * *`, or manual | For open PRs with pending reviewers and 36h+ since last reminder → Slack reminder; GC terminal PR files after 7 days. |
| `pr-closed.yml` | PR closed | Strikethrough Slack header, mark file `merged`/`closed`. |
| `pr-no-review-label.yml` | `no-review` label added | Remove the bot's review requests, delete the Slack message + thread replies, delete the per-PR file. |
| `merge-queue-dequeued.yml` | PR `dequeued` | DM author the dequeue reason. |

### The `no-review` opt-out label

Adding **`no-review`** to a PR takes it out of the bot completely: no reviewer
assignment, no Slack post, no reminders. It works before *and* after assignment —
if the bot already ran, `pr-no-review-label.yml` unwinds it. Removing the label
re-runs assignment (via the `unlabeled` trigger on `pr-reviewer-assign.yml`).
The label is created in the GitHub UI, not Terraform. Note this only silences the
bot — `main` branch protection still requires 1 approval.

## Editing notes

- Adding a service: add it to the hardcoded matrix in `lambda-tests.yml` (lives under `lambdas/`, not `tools/`) and ensure an AWS function `branch-<name>` + API Gateway route exist (`infrastructure/aws`) for `lambda-deploy` to target.
- Adding a shared package: drop `shared/<name>/package.json`. `.github/actions/build-shared-packages` globs `shared/*/`, builds in `@branch/*` dep order, and (when `test: true`) runs any `test` script. No new workflow step. Declare `@branch/*` deps in package.json so the order is right; a cycle fails the run.
- Changing required checks requires a matching update in `infrastructure/github/main.tf` branch protection.
- Bot logic edits: test against the `bot-state` `config.json` shape; never write `config.json` from a workflow (Terraform owns it).
