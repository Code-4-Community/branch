# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | 6.14.1 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.14.1 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/db_instance) | resource |
| [aws_db_subnet_group.branch_rds_subnet_group](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/db_subnet_group) | resource |
| [aws_s3_bucket.c4c_demo](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_subnets.default](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/subnets) | data source |
| [infisical_secrets.rds_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_rds_endpoint"></a> [rds\_endpoint](#output\_rds\_endpoint) | RDS instance endpoint |
| <a name="output_rds_port"></a> [rds\_port](#output\_rds\_port) | RDS instance port |
<!-- END_TF_DOCS -->
