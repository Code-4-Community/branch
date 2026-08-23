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

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_tags"></a> [tags](#module\_tags) | ../modules/tags | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_cloudfront_distribution.previews](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_distribution) | resource |
| [aws_cloudfront_function.preview_rewrite](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_function) | resource |
| [aws_cloudfront_origin_access_control.previews](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/cloudfront_origin_access_control) | resource |
| [aws_s3_bucket.previews](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_policy.previews](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.previews](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.previews_bucket](https://registry.terraform.io/providers/hashicorp/aws/6.14.1/docs/data-sources/iam_policy_document) | data source |

## Inputs

No inputs.

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_previews_bucket"></a> [previews\_bucket](#output\_previews\_bucket) | Shared S3 bucket preview frontends are synced into (under pr-<N>/) |
| <a name="output_previews_cloudfront_distribution_id"></a> [previews\_cloudfront\_distribution\_id](#output\_previews\_cloudfront\_distribution\_id) | Shared CloudFront distribution id (for per-PR cache invalidation in CI) |
| <a name="output_previews_cloudfront_domain"></a> [previews\_cloudfront\_domain](#output\_previews\_cloudfront\_domain) | Shared CloudFront domain; preview URL is https://<domain>/pr-<N>/ |
<!-- END_TF_DOCS -->
