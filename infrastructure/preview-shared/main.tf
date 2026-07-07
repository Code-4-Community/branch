# Shared, persistent hosting for ALL ephemeral PR preview frontends.
#
# One CloudFront distribution + one private S3 origin bucket, created ONCE and
# never mutated per PR. Each preview PR is a path prefix under the bucket:
#
#   https://<dist>.cloudfront.net/pr-<N>/
#
# The per-PR workflow (.github/workflows/preview-env.yml) just `s3 sync`s a
# basePath=/pr-<N> Next.js export into pr-<N>/ and invalidates /pr-<N>/*.
# HTTPS comes free via the default *.cloudfront.net cert — the whole point is
# to serve preview logins (real Cognito passwords) over TLS without standing up
# (and later tearing down) a CloudFront distribution per PR.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "previews" {
  bucket = "branch-previews-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "previews" {
  bucket                  = aws_s3_bucket.previews.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront reads S3 via Origin Access Control (bucket stays private).
resource "aws_cloudfront_origin_access_control" "previews" {
  name                              = "branch-previews-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Per-prefix rewrite + SPA fallback. Each preview is namespaced under /pr-<N>/
# and built with basePath=/pr-<N>, so all assets/pages live under that prefix.
#   - requests for real files (last segment has a dot) pass through untouched
#   - trailing-slash paths map to the exported .../index.html (trailingSlash=true)
#   - extensionless, non-slash paths are client-routed SPA deep links (e.g.
#     /pr-7/projects/42) → serve that prefix's /pr-<N>/index.html so the Next
#     client router can render. This replaces prod's global 403/404 -> /index.html
#     fallback, which can't target a per-PR index on a shared distribution.
resource "aws_cloudfront_function" "preview_rewrite" {
  name    = "branch-previews-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Per-PR index rewrite + SPA fallback for preview prefixes"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
      // Real asset (has a file extension) — leave it alone.
      if (lastSegment.indexOf('.') !== -1) {
        return request;
      }
      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
        return request;
      }
      // Extensionless, no trailing slash → SPA deep link. Serve the PR
      // prefix's index.html (first path segment, e.g. "pr-123").
      var parts = uri.split('/').filter(function (p) { return p.length > 0; });
      var prefix = parts.length > 0 ? parts[0] : '';
      request.uri = '/' + prefix + '/index.html';
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "previews" {
  enabled     = true
  comment     = "branch PR previews (shared, per-PR path prefixes)"
  price_class = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.previews.bucket_regional_domain_name
    origin_id                = "s3-previews"
    origin_access_control_id = aws_cloudfront_origin_access_control.previews.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-previews"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    # AWS managed "CachingOptimized" policy.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.preview_rewrite.arn
    }
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
data "aws_iam_policy_document" "previews_bucket" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.previews.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.previews.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "previews" {
  bucket = aws_s3_bucket.previews.id
  policy = data.aws_iam_policy_document.previews_bucket.json
}

output "previews_bucket" {
  description = "Shared S3 bucket preview frontends are synced into (under pr-<N>/)"
  value       = aws_s3_bucket.previews.bucket
}

output "previews_cloudfront_domain" {
  description = "Shared CloudFront domain; preview URL is https://<domain>/pr-<N>/"
  value       = aws_cloudfront_distribution.previews.domain_name
}

output "previews_cloudfront_distribution_id" {
  description = "Shared CloudFront distribution id (for per-PR cache invalidation in CI)"
  value       = aws_cloudfront_distribution.previews.id
}
