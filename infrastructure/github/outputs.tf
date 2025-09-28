# Export RDS credentials from GitHub module
output "rds_username" {
  description = "RDS username from Infisical"
  value       = data.infisical_secrets.aws_folder.secrets["rds-username"].value
  sensitive   = true
}

output "rds_password" {
  description = "RDS password from Infisical"
  value       = data.infisical_secrets.aws_folder.secrets["rds-password"].value
  sensitive   = true
}

# Export other useful values
output "github_repository_name" {
  description = "Name of the GitHub repository"
  value       = github_repository.branch.name
}

