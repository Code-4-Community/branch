terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.6"
    }
    infisical = {
      source = "infisical/infisical"
    }
  }
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
