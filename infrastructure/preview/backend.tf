terraform {
  backend "s3" {
    bucket         = "c4c-neu-terraform-state-files"
    key            = "preview/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

# NOTE: This module is applied once per PR via a Terraform WORKSPACE named
# pr-<N> (see .github/workflows/preview-env.yml), so state actually lands at
# preview/env:/pr-<N>/terraform.tfstate. It is intentionally excluded from the
# repo-wide terraform-plan / terraform-apply workflows (which run in the default
# workspace with no pr_number and would otherwise create garbage `branch-pr-*`
# resources) — see the `grep -vx 'infrastructure/preview'` filters there.
