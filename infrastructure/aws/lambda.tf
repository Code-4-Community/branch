# IAM role for Lambda functions
resource "aws_iam_role" "lambda_role" {
  name = "branch-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Attach basic execution policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Two paths call AdminDeleteUser: the auth lambda's registration rollback, when
# the branch.users write fails after a successful Cognito SignUp, and the users
# lambda's DELETE /users/{userId}. Without this it fails AccessDeniedException
# and orphans a Cognito user with no DB row: that user can never log in
# (authenticate.ts finds no row) and re-registering returns 409 from Cognito.
#
# Every other Cognito API the auth lambda uses (SignUp, InitiateAuth,
# RespondToAuthChallenge, ConfirmSignUp, ResendConfirmationCode,
# ForgotPassword, ConfirmForgotPassword, GlobalSignOut) is modelled
# smithy.api#noAuth in the AWS SDK and needs no IAM at all -- which is also why
# local docker-compose auth works with no AWS credentials.
#
# AdminCreateUser is additionally needed by the users lambda (POST /users) to
# provision new Cognito accounts at invitation time.
resource "aws_iam_role_policy" "lambda_cognito_admin" {
  name = "branch-lambda-cognito-admin"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AuthLambdaUserPoolAdmin"
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminGetUser",
      ]
      Resource = aws_cognito_user_pool.branch_user_pool.arn
    }]
  })
}

# The role had no S3 permissions at all, so report-service.ts's PutObject failed
# AccessDeniedException on every POST /reports/generate. GetObject is needed too:
# a presigned URL carries the signer's permissions, so neither the expenditures
# lambda's receipt PUT/GET nor GET /reports/{id}/download can mint a working link
# unless this role may itself read and write the object.
resource "aws_iam_role_policy" "lambda_s3_objects" {
  name = "branch-lambda-s3-objects"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaReportsBucketObjects"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          # DELETE /expenditures/{id}, DELETE /reports/{id} and the cascade from
          # DELETE /projects/{id} remove the object alongside the row, so the
          # bucket does not accumulate files no row points at any more.
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.reports_bucket.arn}/*"
      },
      {
        # Scoped to the bucket itself, not its objects: ListObjectsV2 authorizes
        # against the bucket ARN. DELETE /projects/{id} needs it because the
        # cascade removes the rows naming the files, leaving the receipts/{id}/
        # and reports/{id}/ prefixes as the only record of what to clean up.
        Sid      = "LambdaReportsBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.reports_bucket.arn
      },
    ]
  })
}

# Get AWS account ID for unique bucket naming
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "branch-lambda-deployments-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Define all Lambda functions
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

# Minimal placeholder that will be replaced by GitHub Actions on first deployment
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda-placeholder.zip"
  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'Placeholder - will be replaced by CI/CD' }) });"
    filename = "handler.js"
  }
}

# This allows Terraform to create the Lambda functions initially
resource "aws_s3_object" "lambda_placeholder" {
  for_each = local.lambda_functions

  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "${each.key}/initial.zip"
  source = data.archive_file.lambda_placeholder.output_path

  content_type = "application/zip"
}

# Create all Lambda functions with a single resource block
resource "aws_lambda_function" "functions" {
  for_each = local.lambda_functions

  function_name = "branch-${each.key}"
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  timeout       = 30
  memory_size   = 256
  role          = aws_iam_role.lambda_role.arn

  # Use S3 for deployment (initial placeholder, replaced by GitHub Actions)
  s3_bucket = aws_s3_bucket.lambda_deployments.id
  s3_key    = aws_s3_object.lambda_placeholder[each.key].key

  # Prevent Terraform from reverting code deployments made by GitHub Actions
  lifecycle {
    ignore_changes = [s3_key]
  }

  # This block is AUTHORITATIVE, and is deliberately NOT in ignore_changes.
  # The Cognito IDs used to exist only as hand-set console values outside
  # Terraform state, so any `terraform apply` of this module deleted them and
  # shared/lambda-auth/src/authenticate.ts then failed to build a verifier on
  # every authenticated request in all six lambdas -- surfacing as blanket 401s
  # rather than a loud error, because the throw happens inside a try block.
  # Anything a lambda reads from process.env must be listed here.
  #
  # AWS_REGION is intentionally absent: it is a Lambda reserved key that the
  # runtime provides, and the handlers already default to us-east-2.
  environment {
    variables = {
      NODE_ENV    = "production"
      DB_HOST     = aws_db_instance.branch_rds.address
      DB_USER     = data.infisical_secrets.rds_folder.secrets["username"].value
      DB_PASSWORD = data.infisical_secrets.rds_folder.secrets["password"].value
      DB_PORT     = try(data.infisical_secrets.rds_folder.secrets["db_port"].value, "5432")
      DB_NAME     = try(data.infisical_secrets.rds_folder.secrets["db_name"].value, aws_db_instance.branch_rds.db_name)

      # Not secrets: the user pool ID is public, and the app client is created
      # with generate_secret = false, so there is no SECRET_HASH to protect.
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.branch_user_pool.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.branch_client.id

      # Read by lambdas/reports/{handler,report-service}.ts. Previously hand-set
      # on branch-reports only; listed here so this authoritative block does not
      # wipe it. Harmless on the other five functions.
      REPORTS_BUCKET_NAME = aws_s3_bucket.reports_bucket.id
    }
  }
}