# Custom domain for the app, on a subdomain delegated from the client's registrar.
#
# The apex (e.g. branchinitiative.com) stays with the marketing site. Only
# var.app_domain is delegated here, via NS records set once at the registrar --
# see the app_domain_nameservers output.
#
# Three states, so nothing is created in an account that is not going to keep it:
#   app_domain = ""     -> no DNS resources at all
#   app_domain set      -> zone + certificate requests; read the nameservers,
#                          set them at the registrar, wait for them to resolve
#   + enable_custom_domain -> validation completes and the domains attach
#
# The second step exists because ACM validates over public DNS: enabling
# everything at once blocks the apply for 45 minutes and then fails.

locals {
  create_dns = var.app_domain != ""
  attach_dns = local.create_dns && var.enable_custom_domain
  api_domain = local.create_dns ? "api.${var.app_domain}" : ""
}

resource "aws_route53_zone" "app" {
  count = local.create_dns ? 1 : 0

  name = var.app_domain
}

# CloudFront only accepts certificates from us-east-1, whatever region the rest
# of the stack runs in.
resource "aws_acm_certificate" "frontend" {
  count    = local.create_dns ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.app_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# The API Gateway custom domain is REGIONAL, so its certificate has to be in the
# same region as the API.
resource "aws_acm_certificate" "api" {
  count = local.create_dns ? 1 : 0

  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "frontend_cert_validation" {
  for_each = local.create_dns ? {
    for o in aws_acm_certificate.frontend[0].domain_validation_options :
    o.domain_name => o
  } : {}

  zone_id         = aws_route53_zone.app[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = local.create_dns ? {
    for o in aws_acm_certificate.api[0].domain_validation_options :
    o.domain_name => o
  } : {}

  zone_id         = aws_route53_zone.app[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "frontend" {
  count    = local.attach_dns ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for r in aws_route53_record.frontend_cert_validation : r.fqdn]
}

resource "aws_acm_certificate_validation" "api" {
  count = local.attach_dns ? 1 : 0

  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

resource "aws_api_gateway_domain_name" "api" {
  count = local.attach_dns ? 1 : 0

  domain_name              = local.api_domain
  regional_certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "api" {
  count = local.attach_dns ? 1 : 0

  api_id      = aws_api_gateway_rest_api.branch_api.id
  stage_name  = aws_api_gateway_stage.branch_stage.stage_name
  domain_name = aws_api_gateway_domain_name.api[0].domain_name
}

resource "aws_route53_record" "frontend" {
  count = local.attach_dns ? 1 : 0

  zone_id = aws_route53_zone.app[0].zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  count = local.attach_dns ? 1 : 0

  zone_id = aws_route53_zone.app[0].zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api[0].regional_domain_name
    zone_id                = aws_api_gateway_domain_name.api[0].regional_zone_id
    evaluate_target_health = false
  }
}

output "app_domain_nameservers" {
  description = "Nameservers for the app subdomain; add these as NS records at the registrar"
  value       = local.create_dns ? aws_route53_zone.app[0].name_servers : []
}

output "app_url" {
  description = "Public URL of the app once the custom domain is attached"
  value       = local.attach_dns ? "https://${var.app_domain}" : null
}

output "api_url" {
  description = "Public URL of the API once the custom domain is attached"
  value       = local.attach_dns ? "https://${local.api_domain}" : null
}
