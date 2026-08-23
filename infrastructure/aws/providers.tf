terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.14.1"
    }
    infisical = {
      source = "infisical/infisical"
    }
  }
}

module "tags" {
  source = "../modules/tags"
}

provider "aws" {
  region = "us-east-2"

  default_tags {
    tags = module.tags.tags
  }
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