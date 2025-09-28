terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.14.1"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.6"
    }
    infisical = {
      source = "infisical/infisical"
    }
  }
}

provider "aws" {
  region = "us-east-2"
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
