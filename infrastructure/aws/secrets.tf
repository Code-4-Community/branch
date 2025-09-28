data "infisical_secrets" "github_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/github"
}

data "infisical_secrets" "infisical_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/infisical"
}

data "infisical_secrets" "aws_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/aws/rds"
}

data "github_repository" "branch" {
  name = "branch"
}
resource "github_actions_secret" "infisical_client_id" {
  repository      = data.github_repository.branch.name
  secret_name     = "INFISICAL_CLIENT_ID"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["infisical-tf-client-id"].value
}

resource "github_actions_secret" "infisical_client_secret" {
  repository      = data.github_repository.branch.name
  secret_name     = "INFISICAL_CLIENT_SECRET"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["infisical-tf-client-secret"].value
}


resource "infisical_client_secret" "rds_username" {
  secret_name     = "RDS_USERNAME"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["rds-username"].value
}
resource "infisical_client_secret" "rds_password" {
  secret_name     = "RDS_PASSWORD"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["rds-password"].value
}

variable "rds_username" {
  type = string
}

variable "rds_password" {
  type = string
}