# Terraform Module

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | 6.14.1 |
| <a name="requirement_infisical"></a> [infisical](#requirement\_infisical) | 0.17.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_archive"></a> [archive](#provider\_archive) | n/a |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.14.1 |
| <a name="provider_aws.us_east_1"></a> [aws.us\_east\_1](#provider\_aws.us\_east\_1) | 6.14.1 |
| <a name="provider_infisical"></a> [infisical](#provider\_infisical) | 0.17.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_sentry"></a> [sentry](#module\_sentry) | ../modules/sentry | n/a |
| <a name="module_tags"></a> [tags](#module\_tags) | ../modules/tags | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_acm_certificate.api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/acm_certificate) | resource |
| [aws_acm_certificate.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/acm_certificate) | resource |
| [aws_acm_certificate_validation.api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/acm_certificate_validation) | resource |
| [aws_acm_certificate_validation.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/acm_certificate_validation) | resource |
| [aws_api_gateway_base_path_mapping.api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_base_path_mapping) | resource |
| [aws_api_gateway_deployment.branch_deployment](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_deployment) | resource |
| [aws_api_gateway_domain_name.api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_domain_name) | resource |
| [aws_api_gateway_gateway_response.cors](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_gateway_response) | resource |
| [aws_api_gateway_integration.cors](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration.lambda_integrations](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration.lambda_proxy_integrations](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_integration) | resource |
| [aws_api_gateway_integration_response.cors](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_integration_response) | resource |
| [aws_api_gateway_method.cors_proxy_options](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method.lambda_methods](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method.lambda_proxy_any](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_method) | resource |
| [aws_api_gateway_method_response.cors](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_method_response) | resource |
| [aws_api_gateway_resource.lambda_proxy](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_resource) | resource |
| [aws_api_gateway_resource.lambda_resources](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_resource) | resource |
| [aws_api_gateway_rest_api.branch_api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_rest_api) | resource |
| [aws_api_gateway_stage.branch_stage](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/api_gateway_stage) | resource |
| [aws_cloudfront_distribution.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_function.rewrite_index](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_function) | resource |
| [aws_cloudfront_origin_access_control.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_cloudwatch_log_group.lambda](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudwatch_log_group) | resource |
| [aws_cognito_user_pool.branch_user_pool](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool) | resource |
| [aws_cognito_user_pool_client.branch_client](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cognito_user_pool_client) | resource |
| [aws_db_instance.branch_rds](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/db_instance) | resource |
| [aws_iam_openid_connect_provider.github](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_openid_connect_provider) | resource |
| [aws_iam_role.ci_apply](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.ci_migrate](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.ci_plan](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.ci_preview](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role.lambda_role](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.ci_migrate](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ci_plan_state_lock](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.ci_preview](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.lambda_cognito_admin](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.lambda_s3_objects](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.lambda_ses_send](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.ci_apply_admin](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.ci_plan_readonly](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.lambda_basic](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.functions](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.api_gateway_permissions](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/lambda_permission) | resource |
| [aws_route53_record.api](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.api_cert_validation](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.dmarc](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.frontend_cert_validation](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_dkim](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_mail_from_mx](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_mail_from_spf](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.ses_verification](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_record.spf](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_record) | resource |
| [aws_route53_zone.app](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/route53_zone) | resource |
| [aws_s3_bucket.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket.reports_bucket](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_policy.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.frontend](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_public_access_block.reports_bucket_public_access](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.lambda_deployments](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_versioning) | resource |
| [aws_s3_object.lambda_placeholder](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_object) | resource |
| [aws_security_group.rds](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/security_group) | resource |
| [aws_ses_domain_dkim.app](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/ses_domain_dkim) | resource |
| [aws_ses_domain_identity.app](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/ses_domain_identity) | resource |
| [aws_ses_domain_identity_verification.app](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/ses_domain_identity_verification) | resource |
| [aws_ses_domain_mail_from.app](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/ses_domain_mail_from) | resource |
| [aws_vpc_security_group_egress_rule.rds_all](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/vpc_security_group_egress_rule) | resource |
| [aws_vpc_security_group_ingress_rule.rds_postgres](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/vpc_security_group_ingress_rule) | resource |
| [archive_file.lambda_placeholder](https://registry.terraform.io/providers/hashicorp/archive/latest/docs/data-sources/file) | data source |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.ci_apply_assume](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ci_migrate_assume](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ci_plan_assume](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ci_preview_assume](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.frontend_bucket](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |
| [aws_region.current](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/region) | data source |
| [aws_vpc.default](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/vpc) | data source |
| [infisical_secrets.grafana_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |
| [infisical_secrets.rds_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |
| [infisical_secrets.sentry_folder](https://registry.terraform.io/providers/infisical/infisical/0.17.0/docs/data-sources/secrets) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_app_domain"></a> [app\_domain](#input\_app\_domain) | Subdomain serving the app; delegated to Route 53 from the registrar | `string` | `""` | no |
| <a name="input_dmarc_report_email"></a> [dmarc\_report\_email](#input\_dmarc\_report\_email) | Mailbox receiving DMARC aggregate reports; the rua tag is omitted when empty | `string` | `""` | no |
| <a name="input_enable_custom_domain"></a> [enable\_custom\_domain](#input\_enable\_custom\_domain) | Attach the custom domain to CloudFront and API Gateway | `bool` | `false` | no |
| <a name="input_enable_ses_email"></a> [enable\_ses\_email](#input\_enable\_ses\_email) | Send Cognito invitations from SES on var.app\_domain instead of Cognito's shared sender | `bool` | `false` | no |
| <a name="input_infisical_client_id"></a> [infisical\_client\_id](#input\_infisical\_client\_id) | n/a | `string` | n/a | yes |
| <a name="input_infisical_client_secret"></a> [infisical\_client\_secret](#input\_infisical\_client\_secret) | n/a | `string` | n/a | yes |
| <a name="input_infisical_workspace_id"></a> [infisical\_workspace\_id](#input\_infisical\_workspace\_id) | n/a | `string` | `"d1ee8b80-118c-4daf-ae84-31da43261b76"` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_api_gateway_url"></a> [api\_gateway\_url](#output\_api\_gateway\_url) | The URL of the API Gateway |
| <a name="output_api_url"></a> [api\_url](#output\_api\_url) | Public URL of the API once the custom domain is attached |
| <a name="output_app_domain_nameservers"></a> [app\_domain\_nameservers](#output\_app\_domain\_nameservers) | Nameservers for the app subdomain; add these as NS records at the registrar |
| <a name="output_app_url"></a> [app\_url](#output\_app\_url) | Public URL of the app: the custom domain when attached, else the CloudFront domain |
| <a name="output_ci_apply_role_arn"></a> [ci\_apply\_role\_arn](#output\_ci\_apply\_role\_arn) | OIDC role for terraform-apply / lambda-deploy (write, production env only) |
| <a name="output_ci_migrate_role_arn"></a> [ci\_migrate\_role\_arn](#output\_ci\_migrate\_role\_arn) | OIDC role for the db migrate job (production-db env only) |
| <a name="output_ci_plan_role_arn"></a> [ci\_plan\_role\_arn](#output\_ci\_plan\_role\_arn) | OIDC role for terraform-plan (read-only) |
| <a name="output_ci_preview_role_arn"></a> [ci\_preview\_role\_arn](#output\_ci\_preview\_role\_arn) | OIDC role for preview-env.yml (scoped write, preview env only) |
| <a name="output_cognito_client_id"></a> [cognito\_client\_id](#output\_cognito\_client\_id) | Cognito User Pool Client ID (public client, generate\_secret = false) |
| <a name="output_cognito_region"></a> [cognito\_region](#output\_cognito\_region) | AWS Region for Cognito |
| <a name="output_cognito_user_pool_arn"></a> [cognito\_user\_pool\_arn](#output\_cognito\_user\_pool\_arn) | Cognito User Pool ARN |
| <a name="output_cognito_user_pool_endpoint"></a> [cognito\_user\_pool\_endpoint](#output\_cognito\_user\_pool\_endpoint) | Cognito User Pool Endpoint |
| <a name="output_cognito_user_pool_id"></a> [cognito\_user\_pool\_id](#output\_cognito\_user\_pool\_id) | Cognito User Pool ID (wired into the lambdas by lambda.tf) |
| <a name="output_frontend_bucket"></a> [frontend\_bucket](#output\_frontend\_bucket) | S3 bucket the frontend build is synced to |
| <a name="output_frontend_cloudfront_distribution_id"></a> [frontend\_cloudfront\_distribution\_id](#output\_frontend\_cloudfront\_distribution\_id) | CloudFront distribution id (for cache invalidation in CI) |
| <a name="output_frontend_cloudfront_domain"></a> [frontend\_cloudfront\_domain](#output\_frontend\_cloudfront\_domain) | Public URL of the frontend |
| <a name="output_reports_bucket_name"></a> [reports\_bucket\_name](#output\_reports\_bucket\_name) | Name of the S3 bucket for generated reports |
| <a name="output_ses_from_address"></a> [ses\_from\_address](#output\_ses\_from\_address) | From address used for Cognito mail once enable\_ses\_email is true |
<!-- END_TF_DOCS -->
