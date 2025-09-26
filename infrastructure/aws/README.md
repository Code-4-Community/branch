# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |
| <a name="requirement_infisical"></a> [infisical](#requirement\_infisical) | ~> 0.7 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.0 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | ~> 0.7 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance) | resource |
| [infisical_secrets.aws_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |
| [infisical_secrets.infisical_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
