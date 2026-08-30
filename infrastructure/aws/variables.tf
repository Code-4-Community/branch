variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

# Empty means no DNS resources at all. Set to e.g. branchaccounting.com to create
# the zone and certificates.
variable "app_domain" {
  description = "Domain serving the app; apex or subdomain, resolved by a Route 53 zone"
  type        = string
  default     = ""
}

variable "use_existing_hosted_zone" {
  description = "Adopt the Route 53 zone that Route 53 Domains created at registration instead of creating one"
  type        = bool
  default     = false
}

# Keep false until the subdomain's NS records resolve -- ACM validates over public
# DNS and will otherwise block the apply for 45 minutes before failing.
variable "enable_custom_domain" {
  description = "Attach the custom domain to CloudFront and API Gateway"
  type        = bool
  default     = false
}

# Keep false until DKIM is Verified and the account is out of the SES sandbox.
variable "enable_ses_email" {
  description = "Send Cognito invitations from SES on var.app_domain instead of Cognito's shared sender"
  type        = bool
  default     = false
}

variable "dmarc_report_email" {
  description = "Mailbox receiving DMARC aggregate reports; the rua tag is omitted when empty"
  type        = string
  default     = ""
}
