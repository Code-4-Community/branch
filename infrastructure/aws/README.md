# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | 6.14.1 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_archive"></a> [archive](#provider\_archive) | n/a |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.14.1 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_amplify_app.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/amplify_app) | resource |
| [aws_amplify_branch.main](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/amplify_branch) | resource |
| [aws_api_gateway_deployment.branch_deployment](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_deployment) | resource |
| [aws_api_gateway_integration.lambda_integrations](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_method.lambda_methods](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_resource.lambda_resources](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_resource) | resource |
| [aws_api_gateway_rest_api.branch_api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_rest_api) | resource |
| [aws_api_gateway_stage.branch_stage](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_stage) | resource |
| [aws_cloudwatch_event_api_destination.github_dispatch](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudwatch_event_api_destination) | resource |
| [aws_cloudwatch_event_connection.github_dispatch](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudwatch_event_connection) | resource |
| [aws_cloudwatch_event_rule.amplify_frontend_deploy](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.github_dispatch](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudwatch_event_target) | resource |
| [aws_cognito_user_pool.branch_user_pool](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool) | resource |
| [aws_cognito_user_pool_client.branch_client](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool_client) | resource |
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/db_instance) | resource |
| [aws_iam_role.amplify_ssr](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.eventbridge_api_dest](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.lambda_role](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.eventbridge_api_dest](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.amplify_ssr](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.lambda_basic](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.functions](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.api_gateway_permissions](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/lambda_permission) | resource |
| [aws_s3_bucket.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.reports_bucket](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_policy.reports_bucket_policy](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.reports_bucket_public_access](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_versioning) | resource |
| [aws_s3_object.lambda_placeholder](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_object) | resource |
| [archive_file.lambda_placeholder](https://registry.terraform.io/providers/hashicorp/archive/latest/docs/data-sources/file) | data source |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/caller_identity) | data source |
| [infisical_secrets.github_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |
| [infisical_secrets.rds_folder](https://registry.terraform.io/providers/infisical/infisical/latest/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_api_base_url"></a> [api\_base\_url](#input\_api\_base\_url) | Base URL for the backend API, injected as NEXT\_PUBLIC\_API\_BASE\_URL | `string` | `""` | no |
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_api_gateway_url"></a> [api\_gateway\_url](#output\_api\_gateway\_url) | The URL of the API Gateway |
| <a name="output_cognito_region"></a> [cognito\_region](#output\_cognito\_region) | AWS Region for Cognito |
| <a name="output_cognito_user_pool_arn"></a> [cognito\_user\_pool\_arn](#output\_cognito\_user\_pool\_arn) | Cognito User Pool ARN |
| <a name="output_cognito_user_pool_endpoint"></a> [cognito\_user\_pool\_endpoint](#output\_cognito\_user\_pool\_endpoint) | Cognito User Pool Endpoint |
| <a name="output_reports_bucket_name"></a> [reports\_bucket\_name](#output\_reports\_bucket\_name) | Name of the S3 bucket for generated reports |
<!-- END_TF_DOCS -->
