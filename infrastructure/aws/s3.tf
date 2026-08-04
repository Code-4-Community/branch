resource "aws_s3_bucket" "reports_bucket" {
  bucket_prefix = "c4c-branch-generated-reports"
}

resource "aws_s3_bucket_public_access_block" "reports_bucket_public_access" {
  bucket = aws_s3_bucket.reports_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "reports_bucket_policy" {
  bucket     = aws_s3_bucket.reports_bucket.id
  depends_on = [aws_s3_bucket_public_access_block.reports_bucket_public_access]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.reports_bucket.arn}/*"
      }
    ]
  })
}

output "reports_bucket_name" {
  description = "Name of the S3 bucket for generated reports"
  value       = aws_s3_bucket.reports_bucket.id
}

# Expenditure receipts. Separate from the reports bucket so the two lifecycles
# and access policies can diverge: a receipt is uploaded by the browser against
# a presigned PUT, a report is written by the lambda itself.
resource "aws_s3_bucket" "receipts_bucket" {
  bucket_prefix = "c4c-branch-expenditure-receipts"
}

resource "aws_s3_bucket_public_access_block" "receipts_bucket_public_access" {
  bucket = aws_s3_bucket.receipts_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The browser PUTs straight to S3, from the CloudFront origin, so S3 has to
# answer the preflight itself -- API Gateway is not in that request's path.
resource "aws_s3_bucket_cors_configuration" "receipts_bucket" {
  bucket = aws_s3_bucket.receipts_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

output "receipts_bucket_name" {
  description = "Name of the S3 bucket for expenditure receipts"
  value       = aws_s3_bucket.receipts_bucket.id
}
