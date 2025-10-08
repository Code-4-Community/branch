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

  squash_merge_commit_message = "COMMIT_MESSAGES"
  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  delete_branch_on_merge      = true
  vulnerability_alerts        = true

}

resource "github_branch_default" "main" {
  repository = github_repository.branch.name
  branch     = "main"
}

resource "github_branch_protection" "main" {
  repository_id = github_repository.branch.node_id
  pattern       = "main"

  required_pull_request_reviews {
    required_approving_review_count = 2
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
  }

  required_status_checks {
    strict   = true
    contexts = ["terraform-plan-summary"]
  }

  enforce_admins = false
}


resource "github_repository_collaborator" "collaborators" {
  for_each   = { for c in var.repository_collaborators : c.username => c }
  repository = github_repository.branch.name
  username   = each.value.username
  permission = each.value.permission
}


# TEMPORARY: Intentional plan failure for testing workflow failure path
# Remove this block once verification is complete
data "github_repository" "intentional_missing" {
  name = "definitely-does-not-exist-9b2e5d6a-7c2a-4d5c-8f9e-111111111111"
}

locals {
  # Force evaluation of the missing data source during planning
  trigger_intentional_plan_failure = data.github_repository.intentional_missing.full_name
}
