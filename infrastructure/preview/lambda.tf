# Per-PR copies of the 6 backend lambdas: branch-pr<N>-{auth,donors,...}.
# Created with a placeholder zip; the workflow replaces the code with the PR's
# build via `aws lambda update-function-code` (same as prod lambda-deploy).

# Reuse the existing prod lambda execution role — a preview needs no special
# permissions, and this avoids a per-PR IAM role.
data "aws_iam_role" "lambda_role" {
  name = "branch-lambda-role"
}

module "sentry" {
  source = "../modules/sentry"
}

locals {
  lambda_functions = toset([
    "auth",
    "donors",
    "expenditures",
    "projects",
    "reports",
    "users",
  ])
}

# Minimal placeholder replaced by GitHub Actions on first deployment.
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda-placeholder.zip"
  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'Preview placeholder - replaced by CI' }) });"
    filename = "handler.js"
  }
}

resource "aws_lambda_function" "functions" {
  for_each = local.lambda_functions

  function_name = "branch-pr${var.pr_number}-${each.key}"
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  timeout       = 30
  memory_size   = 256
  role          = data.aws_iam_role.lambda_role.arn

  # Layers are not part of the env map the workflow copies from prod, so the
  # preview stack has to attach this itself.
  layers = [module.sentry.layer_arn]

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  # Let CI own the code; Terraform only guarantees the function exists.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  # SENTRY_DSN rides in on var.lambda_env (copied from prod), which is why this
  # module needs no Infisical provider. That same copy carries SENTRY_ENVIRONMENT
  # = "production", so the per-PR override has to merge last or every preview's
  # errors land in the production issue stream.
  environment {
    variables = merge(
      { NODE_ENV = "production" },
      var.lambda_env,
      {
        NODE_OPTIONS       = module.sentry.node_options
        SENTRY_ENVIRONMENT = "pr-${var.pr_number}"
      },
    )
  }
}
