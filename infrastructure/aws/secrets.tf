variable "infisical_client_id" {
  type = string
}

variable "infisical_client_secret" {
  type = string
}

data "infisical_secrets" "rds_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/aws/rds"
}

data "infisical_secrets" "sentry_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/sentry"
}

data "infisical_secrets" "github_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/github"
}