terraform {
  backend "s3" {
    bucket         = "c4c-neu-terraform-state-files"
    key            = "test/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

{

}

# Intentional access error - invalid S3 bucket name
data "aws_s3_bucket" "nonexistent" {
  bucket = "this-bucket-does-not-exist-12345"
}
