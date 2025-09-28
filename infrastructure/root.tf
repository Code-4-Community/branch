# Root module that demonstrates how to pass data between modules

# Configure providers
terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.8"
    }
  }
}

# Configure the GitHub Provider
provider "github" {
  token = var.github_token
}

# Configure the AWS Provider
provider "aws" {
  region = var.aws_region
}

# Configure the Infisical Provider
provider "infisical" {
  client_id     = var.infisical_client_id
  client_secret = var.infisical_client_secret
}

# GitHub module - this will fetch RDS credentials from Infisical
module "github" {
  source = "./github"

  infisical_client_id      = var.infisical_client_id
  infisical_client_secret  = var.infisical_client_secret
  infisical_workspace_id   = var.infisical_workspace_id
  repository_collaborators = var.repository_collaborators
}

# AWS module - receives RDS credentials from GitHub module
module "aws" {
  source = "./aws"

  # Pass RDS credentials from GitHub module outputs
  rds_username = module.github.rds_username
  rds_password = module.github.rds_password

  infisical_workspace_id = var.infisical_workspace_id
}

# Variables for the root module
variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "infisical_client_id" {
  description = "Infisical client ID"
  type        = string
  sensitive   = true
}

variable "infisical_client_secret" {
  description = "Infisical client secret"
  type        = string
  sensitive   = true
}

variable "infisical_workspace_id" {
  description = "Infisical workspace ID"
  type        = string
  default     = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

variable "repository_collaborators" {
  description = "List of GitHub users to add as collaborators"
  type = list(object({
    username   = string
    permission = string
  }))
  default = []
}

# Outputs from the root module
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.aws.rds_endpoint
}

output "github_repository_name" {
  description = "GitHub repository name"
  value       = module.github.github_repository_name
}

