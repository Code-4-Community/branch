# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_github"></a> [github](#requirement\_github) | ~> 6.6 |
| <a name="requirement_infisical"></a> [infisical](#requirement\_infisical) | 0.17.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_github"></a> [github](#provider\_github) | ~> 6.6 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | 0.17.0 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [github_actions_secret.cognito_client_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.cognito_user_pool_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.gh_pat](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.infisical_client_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.infisical_client_secret](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_secret.slack_bot_token](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_secret) | resource |
| [github_actions_variable.aws_account_id](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/actions_variable) | resource |
| [github_branch.bot_state](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch) | resource |
| [github_branch_default.main](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_default) | resource |
| [github_branch_protection.bot_state](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_protection) | resource |
| [github_branch_protection.main](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_protection) | resource |
| [github_repository.branch](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository) | resource |
| [github_repository_collaborator.collaborators](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_collaborator) | resource |
| [github_repository_environment.preview](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_environment) | resource |
| [github_repository_environment.production_db](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_environment) | resource |
| [github_repository_file.bot_config_json](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_file) | resource |
| [github_repository_file.bot_state_json](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/repository_file) | resource |
| [infisical_secrets.cognito_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |
| [infisical_secrets.github_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |
| [infisical_secrets.infisical_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |
| [infisical_secrets.slack_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_account_id"></a> [aws\_account\_id](#input\_aws\_account\_id) | AWS account hosting the BRANCH infrastructure; published as vars.AWS\_ACCOUNT\_ID | `string` | `"489881683177"` | no |
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |
| <a name="input_repository_collaborators"></a> [repository\_collaborators](#input\_repository\_collaborators) | List of GitHub users to add as collaborators | <pre>list(object({<br>    username   = string<br>    permission = string<br>  }))</pre> | `[]` | no |
| <a name="input_review_bot_always_reviewer_slack"></a> [review\_bot\_always\_reviewer\_slack](#input\_review\_bot\_always\_reviewer\_slack) | Slack member ID of the person who reviews every PR | `string` | `"U07NGFM1QKE"` | no |
| <a name="input_review_bot_github_to_slack"></a> [review\_bot\_github\_to\_slack](#input\_review\_bot\_github\_to\_slack) | Map of GitHub username → Slack member ID (U0…) | `map(string)` | <pre>{<br>  "Rayna-Yu": "U083UGSCU7P",<br>  "Vaibhav978": "U0A6HAVCRMJ",<br>  "mehanana": "U084AMND8FK",<br>  "nourshoreibah": "U07NGFM1QKE",<br>  "shreeyaadhikari": "U0ASA92G3QV",<br>  "tsudhakar87": "U08NFFSJEG1"<br>}</pre> | no |
| <a name="input_review_bot_roster"></a> [review\_bot\_roster](#input\_review\_bot\_roster) | Ordered list of GitHub usernames for round-robin review assignment | `list(string)` | <pre>[<br>  "Rayna-Yu",<br>  "mehanana",<br>  "tsudhakar87",<br>  "Vaibhav978",<br>  "shreeyaadhikari"<br>]</pre> | no |
| <a name="input_review_bot_slack_channel_id"></a> [review\_bot\_slack\_channel\_id](#input\_review\_bot\_slack\_channel\_id) | Slack channel ID where review notifications are posted | `string` | `"C0ADQN0B6F8"` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
