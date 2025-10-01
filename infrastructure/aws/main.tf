resource "aws_db_instance" "branch_rds" {
  allocated_storage    = 10
  db_name              = "branch_rds"
  engine               = "postgres"
  engine_version       = "18.0"
  instance_class       = "db.t3.micro"
  username             = data.infisical_secrets.rds_folder.secrets["username"].value
  password             = data.infisical_secrets.rds_folder.secrets["password"].value
  parameter_group_name = "default.postgres18.0"
  skip_final_snapshot  = true
}