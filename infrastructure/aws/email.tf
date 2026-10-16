locals {
  ses_email        = local.create_dns && var.enable_ses_email
  mail_from_domain = local.create_dns ? "mail.${var.app_domain}" : ""
  ses_from_address = local.create_dns ? "no-reply@${var.app_domain}" : ""

  dmarc_record = var.dmarc_report_email == "" ? "v=DMARC1; p=none;" : "v=DMARC1; p=none; rua=mailto:${var.dmarc_report_email};"
}

data "aws_region" "current" {}

resource "aws_ses_domain_identity" "app" {
  count = local.create_dns ? 1 : 0

  domain = var.app_domain
}

resource "aws_ses_domain_dkim" "app" {
  count = local.create_dns ? 1 : 0

  domain = aws_ses_domain_identity.app[0].domain
}

resource "aws_ses_domain_mail_from" "app" {
  count = local.create_dns ? 1 : 0

  domain           = aws_ses_domain_identity.app[0].domain
  mail_from_domain = local.mail_from_domain
}

resource "aws_route53_record" "ses_verification" {
  count = local.create_dns ? 1 : 0

  zone_id = local.zone_id
  name    = "_amazonses.${var.app_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.app[0].verification_token]
}

resource "aws_route53_record" "ses_dkim" {
  count = local.create_dns ? 3 : 0

  zone_id = local.zone_id
  name    = "${aws_ses_domain_dkim.app[0].dkim_tokens[count.index]}._domainkey.${var.app_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.app[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count = local.create_dns ? 1 : 0

  zone_id = local.zone_id
  name    = aws_ses_domain_mail_from.app[0].mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${data.aws_region.current.region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count = local.create_dns ? 1 : 0

  zone_id = local.zone_id
  name    = aws_ses_domain_mail_from.app[0].mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "spf" {
  count = local.create_dns ? 1 : 0

  zone_id = local.zone_id
  name    = var.app_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "dmarc" {
  count = local.create_dns ? 1 : 0

  zone_id = local.zone_id
  name    = "_dmarc.${var.app_domain}"
  type    = "TXT"
  ttl     = 600
  records = [local.dmarc_record]
}

resource "aws_ses_domain_identity_verification" "app" {
  count = local.ses_email ? 1 : 0

  domain = aws_ses_domain_identity.app[0].id

  depends_on = [
    aws_route53_record.ses_verification,
    aws_route53_record.ses_dkim,
    aws_route53_record.ses_mail_from_mx,
    aws_route53_record.ses_mail_from_spf,
  ]
}

output "ses_from_address" {
  description = "From address used for Cognito mail once enable_ses_email is true"
  value       = local.ses_email ? local.ses_from_address : null
}
