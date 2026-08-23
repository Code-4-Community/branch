terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.14.1"
    }
    archive = {
      source = "hashicorp/archive"
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
