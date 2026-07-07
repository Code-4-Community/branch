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
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}

# One resource per lambda at the API root: /auth, /donors, /projects, ...
resource "aws_api_gateway_resource" "lambda_resources" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  parent_id   = aws_api_gateway_rest_api.branch_api.root_resource_id
  path_part   = each.key
}

# Greedy child per lambda: /<lambda>/{proxy+} captures all sub-paths.
# Each lambda owns its own routing (see @branch/lambda-http dispatcher); API
# Gateway just forwards the full path to the matching service.
resource "aws_api_gateway_resource" "lambda_proxy" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  parent_id   = aws_api_gateway_resource.lambda_resources[each.key].id
  path_part   = "{proxy+}"
}

# ANY on the bare resource (/<lambda>) — {proxy+} requires >=1 trailing segment,
# so the prefix itself needs its own method. ANY also routes OPTIONS preflight
# to the lambda's CORS handler and removes the need to enumerate methods.
resource "aws_api_gateway_method" "lambda_root_any" {
  for_each = local.lambda_functions

  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  resource_id   = aws_api_gateway_resource.lambda_resources[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_root_any" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = aws_api_gateway_resource.lambda_resources[each.key].id
  http_method = aws_api_gateway_method.lambda_root_any[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.key].invoke_arn
}

# ANY on the greedy proxy (/<lambda>/{proxy+}).
resource "aws_api_gateway_method" "lambda_proxy_any" {
  for_each = local.lambda_functions

  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  resource_id   = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_proxy_any" {
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
    aws_api_gateway_integration.lambda_root_any,
    aws_api_gateway_integration.lambda_proxy_any,
  ]

  rest_api_id = aws_api_gateway_rest_api.branch_api.id

  # Redeploy the stage whenever the routing surface changes.
  triggers = {
    redeploy = sha1(jsonencode([
      [for k, r in aws_api_gateway_resource.lambda_resources : r.id],
      [for k, r in aws_api_gateway_resource.lambda_proxy : r.id],
      [for k, m in aws_api_gateway_method.lambda_root_any : m.id],
      [for k, m in aws_api_gateway_method.lambda_proxy_any : m.id],
      [for k, i in aws_api_gateway_integration.lambda_root_any : i.uri],
      [for k, i in aws_api_gateway_integration.lambda_proxy_any : i.uri],
    ]))
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
