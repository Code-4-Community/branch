# Non-secret half of the Sentry wiring, shared by the prod (`aws/`) and per-PR
# (`preview/`) lambda modules. The DSN is NOT here -- it comes from Infisical
# `/sentry`, because this repo is public and a leaked DSN invites event spam.

# Region-pinned: this ARN only resolves from us-east-2.
output "layer_arn" {
  value = "arn:aws:lambda:us-east-2:943013980633:layer:SentryNodeServerlessSDKv10:85"
}

# The layer ships @sentry/aws-serverless; this makes the runtime load its
# auto-instrumentation, which wraps whatever handler `_HANDLER` names. Nothing
# is added to the lambda bundles.
output "node_options" {
  value = "--import @sentry/aws-serverless/awslambda-auto"
}
