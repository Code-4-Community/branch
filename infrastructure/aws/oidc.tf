# GitHub Actions OIDC → scoped IAM roles.
#
# Replaces the long-lived branch-ci-and-iac access keys stored as GitHub
# secrets. Two roles, split by read vs write so plans keep working on PRs while
# the powerful write path is locked to the `production` environment:
#
#   branch-ci-plan   read-only, assumable from ANY workflow context (PR / branch
#                    / merge queue). Safe to expose broadly — it can only read.
#   branch-ci-apply  read-write, assumable ONLY from the `production` GitHub
#                    environment (gate it further with required reviewers on that
#                    environment). Used by terraform-apply + lambda-deploy.
#
# Security comes from *who can assume* (the sub condition), not from narrowing
# the write role's policy — so a rogue workflow on a feature branch can assume at
# most the read-only role.
#
# BOOTSTRAP: creating the OIDC provider + roles needs IAM perms the locked
# branch-ci-and-iac user likely lacks (iam:CreateOpenIDConnectProvider). The
# FIRST apply of this file must be run by an admin/broader principal; afterwards
# CI uses these roles.

locals {
  github_repo = "Code-4-Community/branch"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fca",
  ]
}

# ---------------------------------------------------------------------------
# Plan role — read-only, broadly assumable (PR / branch / merge queue)
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ci_plan_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "ci_plan" {
  name               = "branch-ci-plan"
  assume_role_policy = data.aws_iam_policy_document.ci_plan_assume.json
}

resource "aws_iam_role_policy_attachment" "ci_plan_readonly" {
  role       = aws_iam_role.ci_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# terraform plan is read-only except that it acquires the DynamoDB state lock.
resource "aws_iam_role_policy" "ci_plan_state_lock" {
  name = "tfstate-lock"
  role = aws_iam_role.ci_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
      Resource = "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/terraform-state-lock"
    }]
  })
}

# ---------------------------------------------------------------------------
# Apply role — read-write, assumable ONLY from the `production` environment
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ci_apply_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:environment:production"]
    }
  }
}

resource "aws_iam_role" "ci_apply" {
  name               = "branch-ci-apply"
  assume_role_policy = data.aws_iam_policy_document.ci_apply_assume.json
}

# Broad perms are acceptable here because assumption is locked to the production
# environment (+ required reviewers). Tightening to specific services is a
# follow-up; keeping it broad avoids the missing-permission whack-a-mole the
# scoped branch-ci-and-iac user hit.
resource "aws_iam_role_policy_attachment" "ci_apply_admin" {
  role       = aws_iam_role.ci_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "ci_plan_role_arn" {
  description = "OIDC role for terraform-plan (read-only)"
  value       = aws_iam_role.ci_plan.arn
}

output "ci_apply_role_arn" {
  description = "OIDC role for terraform-apply / lambda-deploy (write, production env only)"
  value       = aws_iam_role.ci_apply.arn
}
