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

  # The lambdas in lambda.tf have no vpc_config, so they run outside any VPC and
  # had no route to this instance while it was private -- every DB-backed request
  # hung until the 30s lambda timeout. Putting them in the VPC instead is the
  # stronger fix but costs a NAT gateway (~$33/mo) or a cognito-idp interface
  # endpoint (~$7/mo), since a VPC lambda with no internet route cannot reach
  # Cognito. Traded away for $0.
  publicly_accessible = true

  # Replaces the VPC default SG, which allowed all protocols from 0.0.0.0/0.
  vpc_security_group_ids = [aws_security_group.rds.id]

  # skip_final_snapshot = true means any replacement destroys the database with
  # no backup, and edits like db_subnet_group_name force replacement.
  lifecycle {
    prevent_destroy = true
  }
}

# Open to the internet on 5432, because non-VPC lambda egress IPs are not
# enumerable: there is no LAMBDA tag in ip-ranges.json, and those lambdas egress
# from the region's EC2 pool (~4.4M addresses in us-east-2). No narrower CIDR
# would still admit them, so the master password is the real control -- rotate it,
# and prefer moving the lambdas into the VPC over keeping this.
resource "aws_security_group" "rds" {
  name        = "branch-rds-sg"
  description = "branch_rds: postgres from anywhere (lambdas run outside the VPC)"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name      = "branch-rds-sg"
    ManagedBy = "terraform"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_postgres" {
  security_group_id = aws_security_group.rds.id
  description       = "Postgres from anywhere; lambda egress IPs are not enumerable"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = "0.0.0.0/0"
}

# The provider deletes AWS's implicit allow-all egress rule unless it is declared.
resource "aws_vpc_security_group_egress_rule" "rds_all" {
  security_group_id = aws_security_group.rds.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

data "aws_vpc" "default" {
  default = true
}
