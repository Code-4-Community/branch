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

provider "aws" {
  region = "us-east-2"
}
