terraform {
  backend "s3" {
    bucket       = "branch-tf-state"
    key          = "preview-shared/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
    encrypt      = true
  }
}
