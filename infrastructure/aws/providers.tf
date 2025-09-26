terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.6"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "~> 0.7"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "github" {
  owner = "Code-4-Community"
  token = data.infisical_secrets.github_folder.secrets["branch-gh-admin"].value
}

provider "infisical" {
  host = "https://app.infisical.com"
  auth = {
    universal = {
      client_id     = var.infisical_client_id
      client_secret = var.infisical_client_secret
    }
  }
}
