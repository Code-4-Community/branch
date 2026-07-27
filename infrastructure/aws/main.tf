resource "aws_db_instance" "branch_rds" {
  allocated_storage = 10
  db_name           = "branch_rds"
  engine            = "postgres"
  # Set to the live version (RDS auto-upgraded 17.6 -> 17.9). Disable auto minor
  # upgrades so the version can't drift above what's pinned here — otherwise
  # `terraform apply` tries to "downgrade" and AWS rejects it, failing the whole
  # aws module. Version bumps are now intentional (edit this + apply).
  engine_version             = "17.9"
  auto_minor_version_upgrade = false
  instance_class             = "db.t3.micro"
  username                   = data.infisical_secrets.rds_folder.secrets["username"].value
  password                   = data.infisical_secrets.rds_folder.secrets["password"].value
  skip_final_snapshot        = true
}
