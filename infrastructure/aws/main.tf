resource "aws_db_instance" "branch_rds" {
  allocated_storage    = 10
  db_name              = "branch_rds"
  engine               = "postgres"
  engine_version       = "18.0"
  instance_class       = "db.t3.micro"
  username             = data.infisical_secrets.aws_folder.secrets["rds_username"].value
  password             = data.infisical_secrets.aws_folder.secrets["rds_password"].value
  parameter_group_name = "default.postgres18.0"
  skip_final_snapshot  = true
}
