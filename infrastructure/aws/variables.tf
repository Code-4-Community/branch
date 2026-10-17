variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

# Empty means no DNS resources at all.
variable "app_domain" {
  description = "Domain serving the app; apex or subdomain, resolved by a Route 53 zone"
  type        = string
  default     = "branchaccounting.org"
}

variable "use_existing_hosted_zone" {
  description = "Adopt the Route 53 zone that Route 53 Domains created at registration instead of creating one"
  type        = bool
  default     = true
}

# Keep false until the domain's NS records resolve -- ACM validates over public
# DNS and will otherwise block the apply for 45 minutes before failing.
variable "enable_custom_domain" {
  description = "Attach the custom domain to CloudFront and API Gateway"
  type        = bool
  default     = true
}

# Requires DKIM Verified and SES production access, else invitations fail.
variable "enable_ses_email" {
  description = "Send Cognito invitations from SES on var.app_domain instead of Cognito's shared sender"
  type        = bool
  default     = true
}

variable "dmarc_report_email" {
  description = "Mailbox receiving DMARC aggregate reports; the rua tag is omitted when empty"
  type        = string
  default     = ""
}
