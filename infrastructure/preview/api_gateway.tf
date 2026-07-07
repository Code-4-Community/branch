# Per-PR REST API Gateway (branch-api-pr<N>) fronting the preview lambdas.
# Mirrors infrastructure/aws/api_gateway.tf. Already HTTPS via *.execute-api.
resource "aws_api_gateway_rest_api" "preview_api" {
  name        = "branch-api-pr${var.pr_number}"
  description = "Preview API Gateway for PR #${var.pr_number}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Attach CORS headers to API-Gateway-generated error responses (e.g. a lambda
# 502 or a 403 for an unmatched route). Without these, such errors reach the
# browser with no Access-Control-Allow-Origin and surface as an opaque "CORS
# error" that hides the real status. '*' matches the lambda json() helper.
resource "aws_api_gateway_gateway_response" "cors" {
  for_each      = toset(["DEFAULT_4XX", "DEFAULT_5XX"])
  rest_api_id   = aws_api_gateway_rest_api.preview_api.id
  response_type = each.key

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}

# Must be kept in sync with infrastructure/aws/api_gateway.tf.
# OPTIONS is added to every resource so browser CORS preflights are answered:
# the frontend sends Content-Type: application/json on every call (see
# apps/frontend/src/lib/api.ts), which makes even GETs non-simple and triggers a
# preflight. Preview frontend (shared CloudFront) and the preview API are
# cross-origin, so without an OPTIONS method API Gateway rejects the preflight
# with no CORS headers → the browser reports a CORS error. Routing OPTIONS to the
# proxy lambda works because the lambda short-circuits OPTIONS with 200 +
# Access-Control-Allow-Origin: * (see each handler's json() helper).
locals {
  base_methods = {
    auth         = ["GET", "POST"]
    donors       = ["GET"]
    expenditures = ["GET", "POST"]
    projects     = ["GET", "POST"]
    reports      = ["GET"]
    users        = ["GET", "POST", "DELETE", "PATCH"]
  }
  lambda_methods = { for svc, methods in local.base_methods : svc => concat(methods, ["OPTIONS"]) }
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

# Greedy child resource so sub-paths (/service/{id}, /service/login, ...) reach
# the proxy lambda. Mirrors infrastructure/aws/api_gateway.tf. Each handler
# strips its own /service prefix before routing (see handler.ts).
resource "aws_api_gateway_resource" "lambda_proxy" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.preview_api.id
  parent_id   = aws_api_gateway_resource.lambda_resources[each.key].id
  path_part   = "{proxy+}"
}

# ANY on the proxy resource covers every method, including OPTIONS preflight.
resource "aws_api_gateway_method" "lambda_proxy_any" {
  for_each = local.lambda_functions

  rest_api_id   = aws_api_gateway_rest_api.preview_api.id
  resource_id   = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_proxy_integrations" {
  for_each = local.lambda_functions

  rest_api_id = aws_api_gateway_rest_api.preview_api.id
  resource_id = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method = aws_api_gateway_method.lambda_proxy_any[each.key].http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.functions[each.key].invoke_arn
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
    aws_api_gateway_integration.lambda_integrations,
    aws_api_gateway_integration.lambda_proxy_integrations,
  ]

  rest_api_id = aws_api_gateway_rest_api.preview_api.id

  # Re-deploy when routing changes (methods or the {proxy+} sub-path routes).
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

resource "aws_api_gateway_stage" "preview_stage" {
  deployment_id = aws_api_gateway_deployment.preview_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.preview_api.id
  stage_name    = "prod"
}
