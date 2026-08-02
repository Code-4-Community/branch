# API Gateway for Lambda functions
resource "aws_api_gateway_rest_api" "branch_api" {
  name        = "branch-api"
  description = "API Gateway for Branch Lambda functions"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Attach CORS headers to API-Gateway-generated error responses (e.g. a lambda
# 502 or a 403 for an unmatched route) so they surface with their real status
# instead of as an opaque browser "CORS error". '*' matches the lambda json()
# helper.
resource "aws_api_gateway_gateway_response" "cors" {
  for_each      = toset(["DEFAULT_4XX", "DEFAULT_5XX"])
  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  response_type = each.key

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
  }
}

# Define supported HTTP methods per Lambda function based on handlers
# NOTE: Must be kept in sync with actual Lambda handlers in apps/backend/lambdas/*/openapi.yaml
# OPTIONS is appended to every resource so browser CORS preflights are answered.
# The frontend sends Content-Type: application/json on every call (see
# apps/frontend/src/lib/api.ts), which makes even GETs non-simple and triggers a
# preflight; the frontend (CloudFront) and this API are cross-origin. Preflight
# is routed to the proxy lambda, which short-circuits OPTIONS with 200 +
# Access-Control-Allow-Origin: * (see each handler's json() helper).
locals {
  base_methods = {
    auth         = ["GET", "POST"]
    donors       = ["GET"]
    expenditures = ["GET", "POST", "PATCH"]
    projects     = ["GET", "POST"]
    reports      = ["GET"]
    users        = ["GET", "POST", "DELETE", "PATCH"]
  }
  lambda_methods = { for svc, methods in local.base_methods : svc => concat(methods, ["OPTIONS"]) }
}

# Create a resource for each Lambda function
resource "aws_api_gateway_resource" "lambda_resources" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  parent_id   = aws_api_gateway_rest_api.branch_api.root_resource_id
  path_part   = each.key
}

# Create methods for each resource based on supported methods
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

  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  resource_id   = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method   = each.value.method
  authorization = "NONE"
}

# Create Lambda integrations
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

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = aws_api_gateway_resource.lambda_resources[each.value.lambda].id
  http_method = aws_api_gateway_method.lambda_methods[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.value.lambda].invoke_arn
}

# Greedy child resource so sub-paths reach the proxy lambda. The frontend calls
# full paths like /auth/login, /projects/{id}, /users/{id}; the single-level
# resources above only match the bare /service, so without {proxy+} these hit no
# method and API Gateway returns 403 (surfaced in the browser as a CORS error).
# Each handler strips its own /service prefix before routing (see handler.ts).
resource "aws_api_gateway_resource" "lambda_proxy" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  parent_id   = aws_api_gateway_resource.lambda_resources[each.key].id
  path_part   = "{proxy+}"
}

# ANY on the proxy resource covers every method, including OPTIONS preflight.
resource "aws_api_gateway_method" "lambda_proxy_any" {
  for_each = local.lambda_functions

  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  resource_id   = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_proxy_integrations" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method = aws_api_gateway_method.lambda_proxy_any[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.key].invoke_arn
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
    aws_api_gateway_integration.lambda_integrations,
    aws_api_gateway_integration.lambda_proxy_integrations,
  ]

  rest_api_id = aws_api_gateway_rest_api.branch_api.id

  # Force a new deployment when routing changes (e.g. the OPTIONS methods added
  # for CORS, or the {proxy+} sub-path routes) — otherwise the stage keeps
  # serving the old method set.
  triggers = {
    redeploy = sha1(jsonencode({
      methods = local.lambda_methods
      proxy   = tolist(local.lambda_functions)
    }))
  }

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