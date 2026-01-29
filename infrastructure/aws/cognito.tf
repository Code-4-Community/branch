# Cognito User Pool for BRANCH application
resource "aws_cognito_user_pool" "branch_user_pool" {
  name = "branch-user-pool"

  # Allow users to sign in with email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # User attributes schema
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Email configuration (using Cognito default for now)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # Prevent accidental deletion
  deletion_protection = "ACTIVE"

  tags = {
    Environment = "development"
    Project     = "branch"
    ManagedBy   = "terraform"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "branch_client" {
  name         = "branch-client"
  user_pool_id = aws_cognito_user_pool.branch_user_pool.id

  # Token validity
  access_token_validity  = 1  # 1 hour
  id_token_validity      = 1  # 1 hour
  refresh_token_validity = 30 # 30 days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Prevent secret generation (for public clients like web/mobile)
  generate_secret = false

  # Prevent user existence errors (security best practice)
  prevent_user_existence_errors = "ENABLED"

  # Attributes
  read_attributes = [
    "email",
    "email_verified",
    "name"
  ]

  write_attributes = [
    "email",
    "name"
  ]

  # Enable token revocation
  enable_token_revocation = true

  # Refresh token rotation
  enable_propagate_additional_user_context_data = false
}

# NOTE: To use these in lambdas, manually create secrets in Infisical at /aws/cognito/:
#   - user_pool_id: Copy from terraform output cognito_user_pool_id
#   - client_id: Copy from terraform output cognito_client_id
#   - region: us-east-2

output "cognito_user_pool_arn" {
  value       = aws_cognito_user_pool.branch_user_pool.arn
  description = "Cognito User Pool ARN"
}

output "cognito_user_pool_endpoint" {
  value       = aws_cognito_user_pool.branch_user_pool.endpoint
  description = "Cognito User Pool Endpoint"
}

output "cognito_region" {
  value       = "us-east-2"
  description = "AWS Region for Cognito"
}
