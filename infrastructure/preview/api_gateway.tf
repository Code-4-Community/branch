# Per-PR REST API Gateway (branch-api-pr<N>) fronting the preview lambdas.
# Mirrors infrastructure/aws/api_gateway.tf. Already HTTPS via *.execute-api.
resource "aws_api_gateway_rest_api" "preview_api" {
  name        = "branch-api-pr${var.pr_number}"
  description = "Preview API Gateway for PR #${var.pr_number}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Must be kept in sync with infrastructure/aws/api_gateway.tf.
locals {
  lambda_methods = {
    auth         = ["GET", "POST"]
    donors       = ["GET"]
    expenditures = ["GET", "POST"]
    projects     = ["GET", "POST"]
    reports      = ["GET"]
    users        = ["GET", "POST", "DELETE", "PATCH"]
  }
}

resource "aws_api_gateway_resource" "lambda_resources" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.preview_api.id
  parent_id   = aws_api_gateway_rest_api.preview_api.root_resource_id
  path_part   = each.key
}

resource "aws_api_gateway_method" "lambda_methods" {
  for_each = merge([
    for lambda, methods in local.lambda_methods : {
      for method in methods :
      "${lambda}-${method}" => {
        lambda = lambda
        method = method
      }
    }
  ]...)

  rest_api_id   = aws_api_gateway_rest_api.preview_api.id
  resource_id   = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method   = each.value.method
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_integrations" {
  for_each = merge([
    for lambda, methods in local.lambda_methods : {
      for method in methods :
      "${lambda}-${method}" => {
        lambda = lambda
        method = method
      }
    }
  ]...)

  rest_api_id = aws_api_gateway_rest_api.preview_api.id
  resource_id = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method = aws_api_gateway_method.lambda_methods[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.value.lambda].invoke_arn
}

resource "aws_lambda_permission" "api_gateway_permissions" {
  for_each = local.lambda_functions

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.preview_api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "preview_deployment" {
  depends_on = [
    aws_api_gateway_integration.lambda_integrations
  ]

  rest_api_id = aws_api_gateway_rest_api.preview_api.id

  # Re-deploy when routing changes.
  triggers = {
    redeploy = sha1(jsonencode(local.lambda_methods))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "preview_stage" {
  deployment_id = aws_api_gateway_deployment.preview_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.preview_api.id
  stage_name    = "prod"
}
