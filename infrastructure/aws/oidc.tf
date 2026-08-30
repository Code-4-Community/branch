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

resource "aws_iam_role_policy" "ci_plan_state_lock" {
  name = "tfstate-lock"
  role = aws_iam_role.ci_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoLock"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/terraform-state-lock"
      },
      {
        Sid    = "S3Lock"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::c4c-neu-terraform-state-files/aws/terraform.tfstate.tflock",
          "arn:aws:s3:::c4c-neu-terraform-state-files/github/terraform.tfstate.tflock",
          "arn:aws:s3:::c4c-neu-terraform-state-files/preview-shared/terraform.tfstate.tflock",
          "arn:aws:s3:::c4c-neu-terraform-state-files/test/terraform.tfstate.tflock",
        ]
      },
    ]
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

# ---------------------------------------------------------------------------
# Preview role — scoped write, assumable ONLY from the `preview` environment.
# Powers .github/workflows/preview-env.yml (ephemeral PR test environments).
# Deliberately NOT AdministratorAccess and NOT the `production` env: previews
# must deploy without the 2-reviewer prod gate, but can only touch throwaway
# `branch-pr*` resources + the shared preview bucket/distribution.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ci_preview_assume" {
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
      values   = ["repo:${local.github_repo}:environment:preview"]
    }
  }
}

resource "aws_iam_role" "ci_preview" {
  name               = "branch-ci-preview"
  assume_role_policy = data.aws_iam_policy_document.ci_preview_assume.json
}

resource "aws_iam_role_policy" "ci_preview" {
  name = "preview-env"
  role = aws_iam_role.ci_preview.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Full lifecycle over per-PR lambdas only.
      {
        Sid      = "PreviewLambdas"
        Effect   = "Allow"
        Action   = "lambda:*"
        Resource = "arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:branch-pr*"
      },
      # Read-only lambda listing + reading prod config to copy env into previews.
      {
        Sid      = "LambdaReadForEnvCopy"
        Effect   = "Allow"
        Action   = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:ListFunctions"]
        Resource = "*"
      },
      {
        Sid      = "ReadSentryLayer"
        Effect   = "Allow"
        Action   = ["lambda:GetLayerVersion"]
        Resource = module.sentry.layer_arn
      },
      # API Gateway: create/destroy per-PR REST APIs. ARNs are random ids, so
      # this cannot be name-scoped — bounded to the account/region instead.
      {
        Sid      = "PreviewApiGateway"
        Effect   = "Allow"
        Action   = "apigateway:*"
        Resource = "arn:aws:apigateway:us-east-2::/*"
      },
      # Pass / read only the shared lambda execution role.
      {
        Sid      = "PassLambdaRole"
        Effect   = "Allow"
        Action   = ["iam:PassRole", "iam:GetRole"]
        Resource = aws_iam_role.lambda_role.arn
      },
      # CloudWatch log groups for the preview lambdas.
      {
        Sid      = "PreviewLogs"
        Effect   = "Allow"
        Action   = "logs:*"
        Resource = "*"
      },
      # Resolve the shared RDS endpoint to build DB_HOST for preview lambdas.
      {
        Sid      = "DescribeRds"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances"]
        Resource = "*"
      },
      # Frontend hosting: sync builds into / delete prefixes from the shared
      # preview bucket, and invalidate the shared distribution.
      {
        Sid    = "PreviewFrontendBucket"
        Effect = "Allow"
        Action = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::branch-previews-${data.aws_caller_identity.current.account_id}",
          "arn:aws:s3:::branch-previews-${data.aws_caller_identity.current.account_id}/*",
        ]
      },
      {
        Sid      = "PreviewCloudFront"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution", "cloudfront:ListDistributions"]
        Resource = "*"
      },
      # Terraform state for the per-PR `preview/` module only. The module is
      # applied via a workspace named pr-<N>, so with the S3 backend's default
      # `env:` workspace_key_prefix the state object is
      # env:/pr-<N>/preview/terraform.tfstate (NOT preview/...). ListBucket is
      # unconditioned so `terraform workspace list` (lists the env:/ prefix) works.
      {
        Sid      = "PreviewTfStateList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::c4c-neu-terraform-state-files"
      },
      {
        Sid    = "PreviewTfState"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::c4c-neu-terraform-state-files/preview/*",
          "arn:aws:s3:::c4c-neu-terraform-state-files/env:/pr-*/preview/*",
        ]
      },
      {
        Sid      = "PreviewTfStateLock"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/terraform-state-lock"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Migrate role — assumable ONLY from the `production-db` environment.
# Powers the `migrate` job in .github/workflows/lambda-deploy.yml, which applies
# apps/backend/db/migrations to the production RDS instance before the new lambda
# code is deployed.
#
# Deliberately NOT branch-ci-apply: applying schema needs to read one lambda's
# config and snapshot one database, nothing else. The job reads the DB connection
# off the deployed branch-auth function rather than holding a copy of the
# credentials, so there is no second place for the prod password to live and
# rotating it in Infisical needs no CI change.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ci_migrate_assume" {
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
      values   = ["repo:${local.github_repo}:environment:production-db"]
    }
  }
}

resource "aws_iam_role" "ci_migrate" {
  name               = "branch-ci-migrate"
  assume_role_policy = data.aws_iam_policy_document.ci_migrate_assume.json
}

resource "aws_iam_role_policy" "ci_migrate" {
  name = "db-migrate"
  role = aws_iam_role.ci_migrate.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # The single source of truth for DB_HOST/USER/PASSWORD/NAME, written by
      # lambda.tf. Reading it means CI can never migrate a database the code is
      # not talking to.
      {
        Sid      = "ReadDbConnectionFromDeployedLambda"
        Effect   = "Allow"
        Action   = ["lambda:GetFunctionConfiguration"]
        Resource = aws_lambda_function.functions["auth"].arn
      },
      # DescribeDBInstances is on "*" because the job resolves the instance by
      # matching DB_HOST rather than by name, so the ARN isn't known up front.
      {
        Sid      = "ResolveInstanceAndSnapshots"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances", "rds:DescribeDBSnapshots"]
        Resource = "*"
      },
      # Pre-migration snapshot, plus pruning old ones. Backup storage under the
      # instance's allocated_storage is free, so this costs nothing and is the
      # only rollback lever that does not require reasoning about timestamps.
      {
        Sid    = "PreMigrationSnapshots"
        Effect = "Allow"
        Action = [
          "rds:CreateDBSnapshot",
          "rds:DeleteDBSnapshot",
          "rds:AddTagsToResource",
        ]
        Resource = [
          aws_db_instance.branch_rds.arn,
          "arn:aws:rds:us-east-2:${data.aws_caller_identity.current.account_id}:snapshot:branch-premigrate-*",
        ]
      },
    ]
  })
}

output "ci_plan_role_arn" {
  description = "OIDC role for terraform-plan (read-only)"
  value       = aws_iam_role.ci_plan.arn
}

output "ci_apply_role_arn" {
  description = "OIDC role for terraform-apply / lambda-deploy (write, production env only)"
  value       = aws_iam_role.ci_apply.arn
}

output "ci_preview_role_arn" {
  description = "OIDC role for preview-env.yml (scoped write, preview env only)"
  value       = aws_iam_role.ci_preview.arn
}

output "ci_migrate_role_arn" {
  description = "OIDC role for the db migrate job (production-db env only)"
  value       = aws_iam_role.ci_migrate.arn
}
