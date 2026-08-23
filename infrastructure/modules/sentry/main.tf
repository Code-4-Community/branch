# Single source of truth for the Sentry wiring shared by the prod (`aws/`) and
# per-PR (`preview/`) lambda modules.

# Region-pinned: this ARN only resolves from us-east-2.
output "layer_arn" {
  value = "arn:aws:lambda:us-east-2:943013980633:layer:SentryNodeServerlessSDKv10:85"
}

# Not a secret -- a DSN only grants write access to one project's event ingest.
output "dsn" {
  value = "https://f06ffee94823a8c11e10edbd59283b4d@o4511657075408896.ingest.us.sentry.io/4511657088450560"
}

# The layer ships @sentry/aws-serverless; this makes the runtime load its
# auto-instrumentation, which wraps whatever handler `_HANDLER` names. Nothing
# is added to the lambda bundles.
output "node_options" {
  value = "--import @sentry/aws-serverless/awslambda-auto"
}
