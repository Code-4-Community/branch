# ──────────────────────────────────────────────────────────────
# PR Review Bot — bot-state branch, seed data, branch protection
# ──────────────────────────────────────────────────────────────

# Branch that holds round-robin state (rotation.json, prs/*.json).
# Created from the default branch; after that it diverges and is
# managed exclusively by GitHub Actions.
resource "github_branch" "bot_state" {
  repository    = github_repository.branch.name
  branch        = "bot-state"
  source_branch = github_branch_default.main.branch
}

# Seed rotation.json so the assign workflow can run immediately.
# After the first apply the bot updates this file on every PR;
# lifecycle ignore_changes keeps Terraform from reverting those edits.
resource "github_repository_file" "rotation_json" {
  repository = github_repository.branch.name
  branch     = github_branch.bot_state.branch
  file       = "rotation.json"

  content = jsonencode({
    version               = 1
    cursor                = 0
    roster                = var.review_bot_roster
    github_to_slack       = var.review_bot_github_to_slack
    always_reviewer_slack = var.review_bot_always_reviewer_slack
    slack_channel_id      = var.review_bot_slack_channel_id
    timezone              = "America/New_York"
  })

  commit_message      = "chore(bot): initialize rotation state"
  commit_author       = "terraform"
  commit_email        = "terraform@noreply.github.com"
  overwrite_on_create = false

  lifecycle {
    ignore_changes = [content]
  }
}

# Lightweight protection: block force-pushes and branch deletion.
# No PR or approval rules — the bot needs to push freely.
resource "github_branch_protection" "bot_state" {
  repository_id = github_repository.branch.node_id
  pattern       = "bot-state"

  allows_force_pushes = false
  allows_deletions    = false
  enforce_admins      = false
}
