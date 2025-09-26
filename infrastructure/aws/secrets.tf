data "infisical_secrets" "aws_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/aws"
}

data "github_repository" "branch" {
  name = "branch"
}

resource "github_actions_secret" "rds_username" {
  repository      = data.github_repository.branch.name
  secret_name     = "RDS_USERNAME"
  plaintext_value = data.infisical_secrets.aws_folder.secrets["rds_username"].value
}

resource "github_actions_secret" "rds_password" {
  repository      = data.github_repository.branch.name
  secret_name     = "RDS_PASSWORD"
  plaintext_value = data.infisical_secrets.aws_folder.secrets["rds_password"].value
}

variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

variable "rds_username" {
  type = string
}

variable "rds_password" {
  type = string
}