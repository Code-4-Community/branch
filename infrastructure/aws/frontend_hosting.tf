# Static frontend hosting: private S3 bucket + CloudFront (OAC).
# The Next.js app is exported as a static SPA (see apps/frontend, output:export)
# and synced to S3 by the frontend-deploy workflow; CloudFront serves it over
# HTTPS with an SPA fallback for client-routed paths (e.g. /projects/:id).

resource "aws_s3_bucket" "frontend" {
  bucket = "branch-frontend-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront reads S3 via Origin Access Control (bucket stays private).
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "branch-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Rewrites pretty paths to the exported index.html files. trailingSlash=true in
# next.config emits /route/index.html, so /route/ -> /route/index.html and
# extensionless /route -> /route/index.html. Unknown paths (e.g. /projects/7)
# then 404 in S3 and hit the SPA fallback below.
resource "aws_cloudfront_function" "rewrite_index" {
  name    = "branch-frontend-rewrite-index"
  runtime = "cloudfront-js-2.0"
  comment = "Append index.html to directory/extensionless requests"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!uri.includes('.')) {
        request.uri += '/index.html';
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "branch frontend (static SPA)"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    # AWS managed "CachingOptimized" policy.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_index.arn
    }
  }

  # SPA fallback: client-routed paths that don't exist as objects (deep links
  # like /projects/7) return index.html so the Next client router can render.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Allow only this CloudFront distribution (via OAC) to read the bucket.
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}

output "frontend_bucket" {
  description = "S3 bucket the frontend build is synced to"
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_cloudfront_domain" {
  description = "Public URL of the frontend"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_cloudfront_distribution_id" {
  description = "CloudFront distribution id (for cache invalidation in CI)"
  value       = aws_cloudfront_distribution.frontend.id
}
