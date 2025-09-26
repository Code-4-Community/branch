# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | n/a |
| <a name="provider_github"></a> [github](#provider\_github) | n/a |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance) | resource |
| [github_actions_secret.rds_password](https://registry.terraform.io/providers/hashicorp/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.rds_username](https://registry.terraform.io/providers/hashicorp/github/latest/docs/resources/actions_secret) | resource |
| [github_repository.branch](https://registry.terraform.io/providers/hashicorp/github/latest/docs/data-sources/repository) | data source |
| [infisical_secrets.aws_folder](https://registry.terraform.io/providers/hashicorp/infisical/latest/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |
| <a name="input_rds_password"></a> [rds\_password](#input\_rds\_password) | n/a | `string` | n/a | yes |
| <a name="input_rds_username"></a> [rds\_username](#input\_rds\_username) | n/a | `string` | n/a | yes |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
