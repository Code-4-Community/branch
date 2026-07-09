output "api_gateway_url" {
  description = "Invoke URL of the preview API Gateway (used as NEXT_PUBLIC_API_BASE_URL)"
  value       = aws_api_gateway_stage.preview_stage.invoke_url
}

output "lambda_function_names" {
  description = "Preview lambda function names, keyed by service — CI targets these for update-function-code"
  value       = { for k, fn in aws_lambda_function.functions : k => fn.function_name }
}
