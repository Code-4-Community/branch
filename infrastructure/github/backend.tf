terraform {
  backend "s3" {
    bucket         = "c4c-neu-terraform-state-files"
    key            = "github/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
