data "infisical_secrets" "aws_folder" {
  env_slug     = "dev"
  workspace_id = var.infisical_workspace_id
  folder_path  = "/aws"
}

variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}