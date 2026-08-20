resource "github_repository" "branch" {
  name        = "branch"
  description = "Branch GitHub Admin"
  visibility  = "public"

  has_downloads   = true
  has_issues      = true
  has_projects    = true
  has_wiki        = true
  has_discussions = true

  allow_merge_commit = false
  allow_squash_merge = true
  allow_rebase_merge = false
  allow_auto_merge   = true

  squash_merge_commit_message = "COMMIT_MESSAGES"
  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  delete_branch_on_merge      = true
  vulnerability_alerts        = true

}

resource "github_branch_default" "main" {
  repository = github_repository.branch.name
  branch     = "main"
}

# NOTE: Merge queue is enabled manually in the GitHub UI
resource "github_branch_protection" "main" {
  repository_id = github_repository.branch.node_id
  pattern       = "main"

  required_pull_request_reviews {
    required_approving_review_count = 1
    dismiss_stale_reviews           = false
    require_code_owner_reviews      = false
    pull_request_bypassers          = ["/nourshoreibah"]
  }

  required_status_checks {
    strict = true
    # "Deployment Summary" is intentionally excluded — it only runs on push to main
    # (via lambda-deploy.yml) and should never be a required check on PRs.
    contexts = ["terraform-plan-summary", "lambda-tests", "frontend-ci"]
  }

  enforce_admins = false
}

# Deployment environment for ephemeral PR preview stacks
# (.github/workflows/preview-env.yml). Intentionally has NO required reviewers —
# previews must deploy on `test-environment` label without a human gate. The
# branch-ci-preview OIDC role it maps to is scoped to throwaway branch-pr*
# resources, so no reviewer gate is needed (unlike `production`).
resource "github_repository_environment" "preview" {
  repository  = github_repository.branch.name
  environment = "preview"
}

# Deployment environment for the `migrate` job in
# .github/workflows/lambda-deploy.yml, which applies apps/backend/db/migrations to
# the production database.
#
# It exists ONLY to give that job its own OIDC subject
# (repo:...:environment:production-db) so it can assume the narrowly-scoped
# branch-ci-migrate role instead of the AdministratorAccess branch-ci-apply role.
#
# Intentionally has NO required reviewers, for the same reason as `preview` but a
# sharper one: `deploy` depends on `migrate`, so a pending approval would leave
# main merged with its schema applied and its lambda code undeployed — silently,
# until someone noticed. The PR already passed 1 approval and code-owner review,
# and the mechanical gates (migrations-fresh, migrations-guard) plus the
# pre-migration snapshot are what actually catch bad migrations. Add
# `reviewers { users = [...] }` HERE, not to `production`, if that changes.
resource "github_repository_environment" "production_db" {
  repository  = github_repository.branch.name
  environment = "production-db"
}

resource "github_repository_collaborator" "collaborators" {
  for_each   = { for c in var.repository_collaborators : c.username => c }
  repository = github_repository.branch.name
  username   = each.value.username
  permission = each.value.permission
}
