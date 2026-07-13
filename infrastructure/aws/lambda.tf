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

# Cognito admin permissions for the users lambda (AdminCreateUser / AdminDeleteUser)
resource "aws_iam_role_policy" "lambda_cognito" {
  name = "branch-lambda-cognito-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
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

  environment {
    variables = {
      NODE_ENV             = "production"
      DB_HOST              = aws_db_instance.branch_rds.address
      DB_USER              = data.infisical_secrets.rds_folder.secrets["username"].value
      DB_PASSWORD          = data.infisical_secrets.rds_folder.secrets["password"].value
      DB_PORT              = try(data.infisical_secrets.rds_folder.secrets["db_port"].value, "5432")
      DB_NAME              = try(data.infisical_secrets.rds_folder.secrets["db_name"].value, aws_db_instance.branch_rds.db_name)
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.branch_user_pool.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.branch_client.id
    }
  }
}