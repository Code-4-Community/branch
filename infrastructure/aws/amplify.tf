# SSR (WEB_COMPUTE) apps require a service role so Amplify can provision the
# compute backend and write its CloudWatch logs. Without it, SSR deploys fail.
resource "aws_iam_role" "amplify_ssr" {
  name = "branch-amplify-ssr-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "amplify_ssr" {
  role       = aws_iam_role.amplify_ssr.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

resource "aws_amplify_app" "frontend" {
  name                 = "branch-frontend"
  repository           = "https://github.com/Code-4-Community/branch"
  access_token         = data.infisical_secrets.github_folder.secrets["branch-gh-admin"].value
  platform             = "WEB_COMPUTE"
  iam_service_role_arn = aws_iam_role.amplify_ssr.arn

  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - .next/cache/**/*
  EOT

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = "apps/frontend"
    # Default the API base URL to the deployed API Gateway stage so the built
    # frontend talks to the real backend instead of localhost. var.api_base_url
    # still overrides when set (was previously "" -> apiFetch hit localhost).
    NEXT_PUBLIC_API_BASE_URL = var.api_base_url != "" ? var.api_base_url : aws_api_gateway_stage.branch_stage.invoke_url
  }

  enable_branch_auto_deletion = true
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
  framework   = "Next.js - SSR"
  stage       = "PRODUCTION"

  enable_auto_build = true
}
