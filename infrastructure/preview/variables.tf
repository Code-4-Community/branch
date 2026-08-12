variable "pr_number" {
  description = "PR number this preview stack belongs to. Suffixes every resource (branch-pr<N>-*)."
  type        = string
}

# Full runtime environment for the preview lambdas, resolved by the workflow
# from the ACTUAL prod lambda config (branch-auth + branch-reports). Passing it in
# keeps prod as the single source of truth for DB_HOST / DB creds / Cognito ids /
# reports bucket rather than duplicating -- or re-deriving -- them here.
# Preview envs deliberately reuse the shared RDS + Cognito pool (data risk is
# accepted); migrations are NEVER run from this module -- the generated DB types
# hardcode the `branch.` schema prefix, so a per-PR schema would require per-PR
# type regeneration and rebuilding every lambda. A PR that adds a migration
# therefore cannot be fully previewed.
variable "lambda_env" {
  description = "Environment variables applied to every preview lambda (superset across services)."
  type        = map(string)
  default     = {}
}
