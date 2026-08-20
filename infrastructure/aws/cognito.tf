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

  # Disable self-signup — accounts are created by admins only
  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "Your BRANCH Accounting Platform Invitation"
      email_message = "You have been invited to the BRANCH Accounting Platform. Your username is {username} and temporary password is {####}. Log in and set a new password to get started."
      sms_message   = "BRANCH invite: username {username}, temp password {####}."
    }
  }

  # Email configuration (using Cognito default for now)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # AUDIT, not ENFORCED: every sign-in is proxied through the auth lambda, so all
  # InitiateAuth calls arrive from a handful of Lambda ENI addresses. Under
  # ENFORCED, adaptive authentication risk-scores that shared IP and can block or
  # force MFA on legitimate users after unrelated failures by other users, and
  # correct scoring needs client-side UserContextData the lambda cannot supply
  # (enable_propagate_additional_user_context_data is false below). AUDIT keeps
  # the risk telemetry without gating logins. ENFORCED also requires the Cognito
  # Plus feature tier.
  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }

  # TOTP MFA is optional, opt-in per user via POST /auth/mfa-setup +
  # /auth/mfa-verify (apps/backend/lambdas/auth/handler.ts) -- never forced at
  # login. POST /auth/respond-challenge already handles SOFTWARE_TOKEN_MFA /
  # SMS_MFA / EMAIL_OTP / SELECT_MFA_TYPE for the sign-in side.
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
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

# The lambdas get these IDs from Terraform directly -- see the `environment`
# block in lambda.tf. There is no manual console or Infisical step for the lambda
# runtime any more.
#
# The Infisical /aws/cognito folder is still the source for the COGNITO_*
# GitHub Actions secrets consumed by .github/workflows/lambda-tests.yml (see
# infrastructure/github/secrets.tf). infrastructure/github is a separate root
# module with separate state and cannot read this module's outputs without a
# terraform_remote_state data source, so keep it in sync with the outputs below
# if this pool is ever recreated.

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.branch_user_pool.id
  description = "Cognito User Pool ID (wired into the lambdas by lambda.tf)"
}

output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.branch_client.id
  description = "Cognito User Pool Client ID (public client, generate_secret = false)"
}

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
