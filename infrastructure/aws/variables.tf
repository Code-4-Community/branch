variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

# Empty means no DNS resources at all. Set to e.g. accounting.branchinitiative.com
# to create the zone and certificates.
variable "app_domain" {
  description = "Subdomain serving the app; delegated to Route 53 from the registrar"
  type        = string
  default     = ""
}

# Keep false until the subdomain's NS records resolve -- ACM validates over public
# DNS and will otherwise block the apply for 45 minutes before failing.
variable "enable_custom_domain" {
  description = "Attach the custom domain to CloudFront and API Gateway"
  type        = bool
  default     = false
}