# Amplify runs the frontend build outside GitHub Actions, so there is no native
# post-deploy hook. Amplify does emit build state changes to EventBridge, so we
# match those events and fan them into a GitHub `repository_dispatch`, which the
# "Frontend Deploy Notify" workflow reacts to (posts a PR comment + Slack msg).
#
# This replaces a long-polling GitHub Actions job — no idle runner, instant.

locals {
  github_repo_dispatch_url = "https://api.github.com/repos/Code-4-Community/branch/dispatches"
}

# Connection holds the GitHub token EventBridge sends as the Authorization
# header. Reuses the same admin PAT Amplify already uses (see amplify.tf).
resource "aws_cloudwatch_event_connection" "github_dispatch" {
  name               = "branch-github-dispatch"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${data.infisical_secrets.github_folder.secrets["branch-gh-admin"].value}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "github_dispatch" {
  name                             = "branch-github-dispatch"
  invocation_endpoint              = local.github_repo_dispatch_url
  http_method                      = "POST"
  invocation_rate_limit_per_second = 10
  connection_arn                   = aws_cloudwatch_event_connection.github_dispatch.arn
}

# Match only terminal build states on the frontend app's main branch.
resource "aws_cloudwatch_event_rule" "amplify_frontend_deploy" {
  name        = "branch-amplify-frontend-deploy"
  description = "Amplify main-branch deploy status changes for the frontend app"

  event_pattern = jsonencode({
    source        = ["aws.amplify"]
    "detail-type" = ["Amplify Deployment Status Change"]
    detail = {
      appId      = [aws_amplify_app.frontend.id]
      branchName = ["main"]
      jobStatus  = ["SUCCEED", "FAILED", "CANCELLED"]
    }
  })
}

# EventBridge assumes this role to invoke the API destination.
resource "aws_iam_role" "eventbridge_api_dest" {
  name = "branch-eventbridge-api-dest-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_api_dest" {
  name = "invoke-github-dispatch"
  role = aws_iam_role.eventbridge_api_dest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "events:InvokeApiDestination"
      Resource = aws_cloudwatch_event_api_destination.github_dispatch.arn
    }]
  })
}

resource "aws_cloudwatch_event_target" "github_dispatch" {
  rule     = aws_cloudwatch_event_rule.amplify_frontend_deploy.name
  arn      = aws_cloudwatch_event_api_destination.github_dispatch.arn
  role_arn = aws_iam_role.eventbridge_api_dest.arn

  http_target {
    header_parameters = {
      "Content-Type"         = "application/json"
      "Accept"               = "application/vnd.github+json"
      "X-GitHub-Api-Version" = "2022-11-28"
    }
  }

  # Reshape the Amplify event into a repository_dispatch body. EventBridge
  # auto-quotes string variables, so placeholders stay unquoted.
  input_transformer {
    input_paths = {
      jobId  = "$.detail.jobId"
      status = "$.detail.jobStatus"
      appId  = "$.detail.appId"
    }
    input_template = <<-EOT
      {
        "event_type": "amplify-deploy",
        "client_payload": {
          "jobId": <jobId>,
          "status": <status>,
          "appId": <appId>
        }
      }
    EOT
  }
}
