variable "infisical_workspace_id" {
  type    = string
  default = "d1ee8b80-118c-4daf-ae84-31da43261b76"
}

variable "api_base_url" {
  type        = string
  description = "Base URL for the backend API, injected as NEXT_PUBLIC_API_BASE_URL"
}