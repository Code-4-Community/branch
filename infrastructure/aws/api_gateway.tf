# API Gateway for Lambda functions
resource "aws_api_gateway_rest_api" "branch_api" {
  name        = "branch-api"
  description = "API Gateway for Branch Lambda functions"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Define supported HTTP methods per Lambda function based on handlers
# NOTE: Must be kept in sync with actual Lambda handlers in apps/backend/lambdas/*/openapi.yaml
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

# Create a resource for each Lambda function
resource "aws_api_gateway_resource" "lambda_resources" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  parent_id   = aws_api_gateway_rest_api.branch_api.root_resource_id
  path_part   = each.key
}

# API Gateway Authorizer using Cognito
resource "aws_api_gateway_authorizer" "cognito_authorizer" {
  name            = "branch-cognito-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.branch_api.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [aws_cognito_user_pool.branch_user_pool.arn]
  identity_source = "method.request.header.Authorization"
}

# Create methods for each resource based on supported methods
resource "aws_api_gateway_method" "lambda_methods" {
  for_each = merge([
    for lambda, methods in local.lambda_methods : {
      for method in methods :
      "${lambda}-${method}" => {
        lambda    = lambda
        method    = method
      }
    }
  ]...)

  rest_api_id            = aws_api_gateway_rest_api.branch_api.id
  resource_id            = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method            = each.value.method
  authorization          = "COGNITO_USER_POOLS"
  authorizer_id          = aws_api_gateway_authorizer.cognito_authorizer.id
}

# Create Lambda integrations
resource "aws_api_gateway_integration" "lambda_integrations" {
  for_each = merge([
    for lambda, methods in local.lambda_methods : {
      for method in methods :
      "${lambda}-${method}" => {
        lambda    = lambda
        method    = method
      }
    }
  ]...)

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method = aws_api_gateway_method.lambda_methods[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.value.lambda].invoke_arn
}

# Allow API Gateway to invoke Lambda functions
resource "aws_lambda_permission" "api_gateway_permissions" {
  for_each = local.lambda_functions

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.key].function_name
  principal     = "apigateway.amazonaws.com"

  # Grant permission for the specific API Gateway and stage
  source_arn = "${aws_api_gateway_rest_api.branch_api.execution_arn}/*/*"
}

# Create deployment
resource "aws_api_gateway_deployment" "branch_deployment" {
  depends_on = [
    aws_api_gateway_integration.lambda_integrations
  ]

  rest_api_id = aws_api_gateway_rest_api.branch_api.id

  lifecycle {
    create_before_destroy = true
  }
}

# Create stage
resource "aws_api_gateway_stage" "branch_stage" {
  deployment_id = aws_api_gateway_deployment.branch_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  stage_name    = "prod"
}

# Output the API Gateway URL
output "api_gateway_url" {
  description = "The URL of the API Gateway"
  value       = aws_api_gateway_stage.branch_stage.invoke_url
}