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