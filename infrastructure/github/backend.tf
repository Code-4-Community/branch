terraform {
  backend "s3" {
    bucket       = "c4c-neu-terraform-state-files"
    key          = "github/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
    encrypt      = true
  }
}
