# VPC and networking for RDS
data "aws_subnets" "default" {
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# DB subnet group
resource "aws_db_subnet_group" "branch_rds_subnet_group" {
  name       = "branch-rds-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "branch-rds-subnet-group"
  }
}

resource "aws_db_instance" "branch_rds" {
  allocated_storage    = 10
  db_name              = "branch_rds"
  engine               = "postgres"
  engine_version       = "17.6"
  instance_class       = "db.t3.micro"
  username             = data.infisical_secrets.rds_folder.secrets["username"].value
  password             = data.infisical_secrets.rds_folder.secrets["password"].value
  skip_final_snapshot  = true
  publicly_accessible  = true
  db_subnet_group_name = aws_db_subnet_group.branch_rds_subnet_group.name

  tags = {
    Name = "branch-rds-instance"
  }
}

# Output the RDS endpoint for easy access
output "rds_endpoint" {
  value       = aws_db_instance.branch_rds.endpoint
  description = "RDS instance endpoint"
}

output "rds_port" {
  value       = aws_db_instance.branch_rds.port
  description = "RDS instance port"
}
