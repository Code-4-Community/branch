terraform {
  backend "s3" {
    bucket       = "branch-tf-state"
    key          = "test/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
    encrypt      = true
  }
}
