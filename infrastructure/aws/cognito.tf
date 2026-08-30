# Bodies for the pool's two email templates. Table layout and inline styles
# only -- Outlook drops flex, grid and <style> blocks. The logo is served from
# the app origin (local.app_url, dns.tf) and alt-texts to the wordmark for
# clients that block images.
locals {
  invite_email_html = <<-EOT
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAEFEB;padding:24px 0;font-family:Helvetica,Arial,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FFFFFF;border-radius:8px;">
          <tr><td style="background-color:#2D6138;padding:20px 28px;border-radius:8px 8px 0 0;">
            <img src="${local.app_url}/branch-logo.png" alt="BRANCH" width="40" height="40" style="vertical-align:middle;border:0;">
            <span style="color:#FFFFFF;font-size:20px;font-weight:bold;letter-spacing:2px;vertical-align:middle;padding-left:12px;">BRANCH</span>
          </td></tr>
          <tr><td style="padding:28px;color:#2B2B2B;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#2D6138;">Your account is ready</h1>
            <p style="margin:0 0 16px;">You have been invited to the BRANCH accounting platform.</p>
            <p style="margin:0 0 8px;">Sign in with the email address this message was sent to, using this temporary password:</p>
            <p style="margin:0 0 24px;padding:12px 16px;background-color:#EAEFEB;border-radius:6px;font-family:monospace;font-size:18px;letter-spacing:1px;">{####}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
              <tr><td style="background-color:#2D6138;border-radius:6px;">
                <a href="${local.app_url}/login" style="display:inline-block;padding:12px 28px;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none;">Sign in to BRANCH</a>
              </td></tr>
            </table>
            <p style="margin:0;">You will be asked to choose a new password the first time you sign in. This temporary password expires in 7 days.</p>
          </td></tr>
          <tr><td style="padding:0 28px 24px;color:#57805F;font-size:12px;line-height:1.5;">
            <p style="margin:0 0 6px;">If the button does not work, paste this into your browser:<br><a href="${local.app_url}/login" style="color:#2D6138;">${local.app_url}/login</a></p>
            <p style="margin:0;">Not expecting this invitation? You can ignore this email.</p>
            <!-- {username} -->
          </td></tr>
        </table>
      </td></tr>
    </table>
  EOT

  verification_email_html = <<-EOT
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAEFEB;padding:24px 0;font-family:Helvetica,Arial,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FFFFFF;border-radius:8px;">
          <tr><td style="background-color:#2D6138;padding:20px 28px;border-radius:8px 8px 0 0;">
            <img src="${local.app_url}/branch-logo.png" alt="BRANCH" width="40" height="40" style="vertical-align:middle;border:0;">
            <span style="color:#FFFFFF;font-size:20px;font-weight:bold;letter-spacing:2px;vertical-align:middle;padding-left:12px;">BRANCH</span>
          </td></tr>
          <tr><td style="padding:28px;color:#2B2B2B;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#2D6138;">Your verification code</h1>
            <p style="margin:0 0 8px;">Enter this code in BRANCH to continue:</p>
            <p style="margin:0 0 24px;padding:12px 16px;background-color:#EAEFEB;border-radius:6px;font-family:monospace;font-size:24px;letter-spacing:4px;">{####}</p>
            <p style="margin:0;">The code is single-use. Nothing changes on your account until it is entered.</p>
          </td></tr>
          <tr><td style="padding:0 28px 24px;color:#57805F;font-size:12px;line-height:1.5;">
            <p style="margin:0 0 6px;"><a href="${local.app_url}/login" style="color:#2D6138;">${local.app_url}</a></p>
            <p style="margin:0;">Did not request this code? You can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  EOT
}

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
  #
  # {username} renders the pool-generated UUID, not the address, because
  # username_attributes is email. It survives only inside an HTML comment
  # because Cognito rejects an invite template that omits it.
  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "Welcome to BRANCH — your account is ready"
      email_message = local.invite_email_html
      sms_message   = "BRANCH temporary password: {####}. Sign in with your email address. ({username})"
    }
  }

  # One template serves both the sign-up code (POST /auth/verify-email) and the
  # forgot-password code (POST /auth/forgot-password), so the copy stays neutral
  # between them. Must remain CONFIRM_WITH_CODE: the auth lambda calls
  # ConfirmSignUpCommand with a code, not a link.
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your BRANCH verification code"
    email_message        = local.verification_email_html
    sms_message          = "Your BRANCH verification code is {####}"
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

  # Project comes from the provider's default_tags (infrastructure/modules/tags).
  tags = {
    Environment = "development"
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
