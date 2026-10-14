# Public endpoint, IAM-token auth only: no password and no security group.
resource "aws_dsql_cluster" "branch" {
  deletion_protection_enabled = true

  tags = {
    Name = "branch"
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # The provider exports no endpoint attribute; this is the documented form.
  dsql_endpoint = "${aws_dsql_cluster.branch.identifier}.dsql.${data.aws_region.current.region}.on.aws"
}

output "dsql_endpoint" {
  description = "Aurora DSQL cluster endpoint (user admin, database postgres)"
  value       = local.dsql_endpoint
}
