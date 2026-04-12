resource "aws_amplify_app" "frontend" {
  name         = "branch-frontend"
  repository   = "https://github.com/Code-4-Community/branch"
  access_token = data.infisical_secrets.github_folder.secrets["branch-gh-admin"].value
  platform     = "WEB_COMPUTE"

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
    NEXT_PUBLIC_API_BASE_URL  = var.api_base_url
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
