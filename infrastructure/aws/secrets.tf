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
