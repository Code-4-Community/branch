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
| [aws_cognito_user_pool.branch_user_pool](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool) | resource |
| [aws_cognito_user_pool_client.branch_client](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool_client) | resource |
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/db_instance) | resource |
| [aws_s3_bucket.reports_bucket](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
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
| <a name="output_cognito_region"></a> [cognito\_region](#output\_cognito\_region) | AWS Region for Cognito |
| <a name="output_cognito_user_pool_arn"></a> [cognito\_user\_pool\_arn](#output\_cognito\_user\_pool\_arn) | Cognito User Pool ARN |
| <a name="output_cognito_user_pool_endpoint"></a> [cognito\_user\_pool\_endpoint](#output\_cognito\_user\_pool\_endpoint) | Cognito User Pool Endpoint |
<!-- END_TF_DOCS -->
