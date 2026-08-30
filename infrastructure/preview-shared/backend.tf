terraform {
  backend "s3" {
    bucket       = "c4c-neu-terraform-state-files"
    key          = "preview-shared/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
    encrypt      = true
  }
}
