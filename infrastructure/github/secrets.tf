data "infisical_secrets" "github_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/github"
}

data "infisical_secrets" "aws_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/aws"
}

data "infisical_secrets" "infisical_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/infisical"
}


resource "github_actions_secret" "aws_access_key_id" {
  repository      = github_repository.branch.name
  secret_name     = "AWS_ACCESS_KEY_ID"
  plaintext_value = data.infisical_secrets.aws_folder.secrets["aws-branch-iac-and-ci-id"].value
}

resource "github_actions_secret" "aws_secret_access_key" {
  repository      = github_repository.branch.name
  secret_name     = "AWS_SECRET_ACCESS_KEY"
  plaintext_value = data.infisical_secrets.aws_folder.secrets["aws-branch-iac-and-ci-secret"].value
}

resource "github_actions_secret" "infisical_client_id" {
  repository      = github_repository.branch.name
  secret_name     = "INFISICAL_CLIENT_ID"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["infisical-tf-client-id"].value
}

resource "github_actions_secret" "infisical_client_secret" {
  repository      = github_repository.branch.name
  secret_name     = "INFISICAL_CLIENT_SECRET"
  plaintext_value = data.infisical_secrets.infisical_folder.secrets["infisical-tf-client-secret"].value
}



variable "infisical_client_id" {
  type = string
}

variable "infisical_client_secret" {
  type = string
}

variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}
