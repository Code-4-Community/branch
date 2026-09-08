resource "aws_s3_bucket" "reports_bucket" {
  bucket_prefix = "c4c-branch-generated-reports"
}

resource "aws_s3_bucket_public_access_block" "reports_bucket_public_access" {
  bucket = aws_s3_bucket.reports_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Receipt, photo and report uploads are browser PUTs straight at a presigned
# URL, so S3 answers the preflight itself -- the API Gateway CORS in
# api_gateway.tf never sees these requests.
resource "aws_s3_bucket_cors_configuration" "reports_bucket_cors" {
  bucket = aws_s3_bucket.reports_bucket.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_headers = ["content-type"]
    max_age_seconds = 7200

    # CloudFront serves the app whether or not the custom domain is attached.
    allowed_origins = compact([
      "https://${aws_cloudfront_distribution.frontend.domain_name}",
      local.attach_dns ? "https://${var.app_domain}" : "",
    ])
  }
}

output "reports_bucket_name" {
  description = "Name of the S3 bucket for generated reports"
  value       = aws_s3_bucket.reports_bucket.id
}
