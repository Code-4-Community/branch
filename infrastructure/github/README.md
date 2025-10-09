# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_github"></a> [github](#requirement\_github) | ~> 6.6 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_github"></a> [github](#provider\_github) | ~> 6.6 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [github_actions_secret.aws_access_key_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.aws_secret_access_key](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.infisical_client_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.infisical_client_secret](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_branch_default.main](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_default) | resource |
| [github_branch_protection.main](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_protection) | resource |
| [github_repository.branch](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository) | resource |
| [github_repository_collaborator.collaborators](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_collaborator) | resource |
| [infisical_secrets.aws_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |
| [infisical_secrets.github_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |
| [infisical_secrets.infisical_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |
| <a name="input_repository_collaborators"></a> [repository\_collaborators](#input\_repository\_collaborators) | List of GitHub users to add as collaborators | <pre>list(object({<br>    username   = string<br>    permission = string<br>  }))</pre> | `[]` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
