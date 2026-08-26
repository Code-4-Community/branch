# API Gateway for Lambda functions
resource "aws_api_gateway_rest_api" "branch_api" {
  name        = "branch-api"
  description = "API Gateway for Branch Lambda functions"

  # Gzip any response over 1 KB. List endpoints are JSON and compress 70-80%.
  # Below ~1 KB the gzip header outweighs the saving, hence the floor rather
  # than 0. Costs nothing: compression happens in API Gateway, not the lambda.
  minimum_compression_size = 1024

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

  # API Gateway's own default for these types; declared only so plans stop
  # proposing to delete it. Omitting it empties gateway-generated error bodies.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

# Define supported HTTP methods per Lambda function based on handlers
# NOTE: Must be kept in sync with actual Lambda handlers in apps/backend/lambdas/*/openapi.yaml
# OPTIONS is appended to every resource so browser CORS preflights are answered.
# The frontend sends Content-Type: application/json on every call (see
# apps/frontend/src/lib/api.ts), which makes even GETs non-simple and triggers a
# preflight; the frontend (CloudFront) and this API are cross-origin.
#
# The OPTIONS method stays in this map so its address does not churn, but its
# integration is MOCK, not AWS_PROXY -- see aws_api_gateway_integration.cors.
locals {
  base_methods = {
    auth         = ["GET", "POST"]
    donors       = ["GET", "POST"]
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

# Create Lambda integrations. base_methods, not lambda_methods: OPTIONS is
# answered by MOCK below and must not reach a lambda.
resource "aws_api_gateway_integration" "lambda_integrations" {
  for_each = merge([
    for lambda, methods in local.base_methods : {
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

# ---------------------------------------------------------------------------
# CORS preflight, answered by API Gateway instead of by a lambda.
#
# Every browser call here is preflighted: the frontend sends Authorization and
# Content-Type: application/json, which makes even a GET non-simple, and
# CloudFront and API Gateway are different origins.
#
# Those preflights used to be AWS_PROXY, so each one woke a lambda -- doubling
# invocations and paying a full cold start (a multi-MB bundle parse) to answer a
# request that carries no body. dispatch() short-circuits OPTIONS before it
# authenticates or touches the database, so nothing of value happened there.
#
# Access-Control-Max-Age is the other half, and the more valuable one: with no
# Max-Age, Chrome caches a preflight for ~5 seconds, so in practice every
# request paid for its own. 7200 is Chrome's ceiling -- it silently clamps
# anything larger, so asking for 86400 buys nothing.
locals {
  # The bare /service resource and its /{proxy+} child each need their own
  # OPTIONS: {proxy+} does not match the parent path.
  #
  # Holds the service name and which of the two resources it means, NOT the
  # resource id. for_each keys must be known at plan time, and a map built out
  # of resource attributes is a good way to get "cannot be determined until
  # apply" on a fresh state. The id lookup happens inside each block instead.
  cors_targets = merge(
    { for svc in local.lambda_functions : svc => { svc = svc, proxy = false } },
    { for svc in local.lambda_functions : "${svc}-proxy" => { svc = svc, proxy = true } },
  )

  # Values are single-quoted because API Gateway wants a static mapping literal.
  # Kept identical to what the lambda json() helper returned, so this changes
  # who answers a preflight, not what a preflight says.
  cors_headers = {
    "Access-Control-Allow-Origin"  = "'*'"
    "Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "Access-Control-Max-Age"       = "'7200'"
  }
}

# Only the proxy resources need a new method: the bare ones already have OPTIONS
# from local.lambda_methods. Declaring it twice would be two Terraform addresses
# fighting over one API Gateway method. An explicit OPTIONS also takes
# precedence over the ANY on the same resource.
resource "aws_api_gateway_method" "cors_proxy_options" {
  for_each = local.lambda_functions

  rest_api_id   = aws_api_gateway_rest_api.branch_api.id
  resource_id   = aws_api_gateway_resource.lambda_proxy[each.key].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cors" {
  for_each = local.cors_targets

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = each.value.proxy ? aws_api_gateway_resource.lambda_proxy[each.value.svc].id : aws_api_gateway_resource.lambda_resources[each.value.svc].id
  http_method = "OPTIONS"

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\":200}"
  }

  depends_on = [
    aws_api_gateway_method.lambda_methods,
    aws_api_gateway_method.cors_proxy_options,
  ]
}

resource "aws_api_gateway_method_response" "cors" {
  for_each = local.cors_targets

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = each.value.proxy ? aws_api_gateway_resource.lambda_proxy[each.value.svc].id : aws_api_gateway_resource.lambda_resources[each.value.svc].id
  http_method = "OPTIONS"
  status_code = "200"

  response_parameters = { for h in keys(local.cors_headers) : "method.response.header.${h}" => true }

  depends_on = [
    aws_api_gateway_method.lambda_methods,
    aws_api_gateway_method.cors_proxy_options,
  ]
}

resource "aws_api_gateway_integration_response" "cors" {
  for_each = local.cors_targets

  rest_api_id = aws_api_gateway_rest_api.branch_api.id
  resource_id = each.value.proxy ? aws_api_gateway_resource.lambda_proxy[each.value.svc].id : aws_api_gateway_resource.lambda_resources[each.value.svc].id
  http_method = "OPTIONS"
  status_code = aws_api_gateway_method_response.cors[each.key].status_code

  response_parameters = { for h, v in local.cors_headers : "method.response.header.${h}" => v }

  depends_on = [aws_api_gateway_integration.cors]
}

# REQUIRED, not cosmetic. Without these, Terraform sees an integration to create
# at the new address and one to destroy at the old, both pointing at the same
# (resource, OPTIONS) pair in API Gateway. It creates the MOCK, then the destroy
# deletes it -- leaving OPTIONS with no integration at all and 500ing every
# preflight in the app. `moved` makes it one in-place replacement instead.
moved {
  from = aws_api_gateway_integration.lambda_integrations["auth-OPTIONS"]
  to   = aws_api_gateway_integration.cors["auth"]
}

moved {
  from = aws_api_gateway_integration.lambda_integrations["donors-OPTIONS"]
  to   = aws_api_gateway_integration.cors["donors"]
}

moved {
  from = aws_api_gateway_integration.lambda_integrations["expenditures-OPTIONS"]
  to   = aws_api_gateway_integration.cors["expenditures"]
}

moved {
  from = aws_api_gateway_integration.lambda_integrations["projects-OPTIONS"]
  to   = aws_api_gateway_integration.cors["projects"]
}

moved {
  from = aws_api_gateway_integration.lambda_integrations["reports-OPTIONS"]
  to   = aws_api_gateway_integration.cors["reports"]
}

moved {
  from = aws_api_gateway_integration.lambda_integrations["users-OPTIONS"]
  to   = aws_api_gateway_integration.cors["users"]
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
    aws_api_gateway_integration.cors,
    aws_api_gateway_integration_response.cors,
  ]

  rest_api_id = aws_api_gateway_rest_api.branch_api.id

  # Force a new deployment when routing changes (e.g. the OPTIONS methods added
  # for CORS, or the {proxy+} sub-path routes) — otherwise the stage keeps
  # serving the old method set. cors_headers is in here too: changing Max-Age is
  # a change to what the stage serves, and would otherwise not redeploy.
  triggers = {
    redeploy = sha1(jsonencode({
      methods = local.lambda_methods
      proxy   = tolist(local.lambda_functions)
      cors    = local.cors_headers
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