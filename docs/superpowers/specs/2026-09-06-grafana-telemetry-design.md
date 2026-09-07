# Sending metrics and logs to Grafana Cloud

**Date:** 2026-09-06
**Status:** implemented on `worktree-grafana-otel-telemetry`

## Problem

Grafana Cloud is provisioned and the lambdas have carried
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` since commit
`2dacc6d`, but no code in the repo ever read them. The account receives nothing.

What observability exists today: Sentry (uncaught throws, via a Lambda layer)
and unstructured `console.*` in CloudWatch with 30-day retention. There are no
CloudWatch alarms, no dashboards, no X-Ray. So there is no way to answer "is the
API slow", "which endpoint is erroring", "how long does a report take", or "did
that failed login spike matter".

## Decisions

Two choices drove the design. Both were taken as the recommended defaults;
they are recorded here as assumptions rather than as a user ruling.

1. **Bundled OTel SDK in a shared package**, not an ADOT/OTel Lambda layer and
   not CloudWatch EMF. It uses the OTLP endpoint that is already configured and
   paid for, needs **no Terraform change at all**, and gives full control over
   domain metrics. The layer route would have meant a Terraform change plus a
   collector config and ~1s of extra cold start; EMF would have ignored the OTLP
   endpoint and required a Grafana→AWS IAM role.

2. **Metrics and structured logs, not traces.** Sentry already covers exception
   detail, and traces would roughly double the bundle for overlapping value.
   Traces remain easy to add later — the provider module is the only place that
   would change.

## Architecture

One new `file:`-linked package, `@branch/lambda-telemetry`, plus instrumentation
at the two places every request already passes through.

```
shared/lambda-telemetry/
  config.ts    env parsing; returns null when there is no endpoint
  provider.ts  lazy OTel MeterProvider + LoggerProvider, forceFlush
  metrics.ts   instrument registry + recorders; the METRICS name table
  logger.ts    structured logger -> stdout JSON *and* an OTel log record
  context.ts   AsyncLocalStorage request context
  db.ts        the Kysely `log` hook
```

**`dispatch()` is the choke point.** All six services route through it, so
instrumenting it once covers every endpoint: duration histogram, request
counter, cold starts, auth refusals (401 vs 403), unhandled errors, and one
access log per request. Controllers add only domain metrics.

**`db.ts` is the second choke point.** `log: kyselyTelemetryLog` on each
lambda's Kysely instance measures every statement and logs the slow and failed
ones.

### Signals

Automatic, every route:

| Metric | Kind | Labels |
|---|---|---|
| `http.server.requests` | counter | method, route, status |
| `http.server.request.duration` | histogram (ms) | method, route, status |
| `faas.cold_starts` | counter | — |
| `http.server.auth_failures` | counter | method, route, reason |
| `http.server.unhandled_errors` | counter | method, route |
| `db.client.operation.duration` | histogram (ms) | statement kind, outcome |

Domain, recorded explicitly:

| Metric | Where | Why it earns its place |
|---|---|---|
| `branch.auth.logins` | auth | A failure spike is the credential-stuffing signal |
| `branch.auth.registrations` | auth | `invitation_required` shows people bouncing off the invite gate |
| `branch.users.invited` | users | Onboarding throughput |
| `branch.projects.changed` | projects | Deletes cascade into expenditures, reports and S3 |
| `branch.expenditures.changed` | expenditures | The approval funnel: approved / denied / needs_more_info |
| `branch.expenditures.amount` | expenditures | Spend distribution by category |
| `branch.donations.recorded` / `.amount` | donors | Donation rate and size — the number the org actually cares about |
| `branch.reports.generated` | reports | Success vs render-failed vs upload-failed |
| `branch.reports.generation.duration` / `.size` | reports | The slowest path in the backend, and the one nearest the 30s timeout |

Logs: one JSON line per `logger.*` call, to stdout **and** to Loki, carrying
request id, service, route, method, path, cold-start flag, user id, plus the
call's own fields. `serverError()` routes through it, so every 500 is
structured. An `Error` is flattened rather than serialised to `{}`.

## Constraints honoured

- **Telemetry never breaks a request.** Every recorder, the logger and the flush
  swallow their own failures.
- **No unbounded labels.** Route patterns, never concrete paths; statement kind,
  never SQL; no ids, no email addresses.
- **Flush before the freeze.** `dispatch()` flushes in a `finally`, capped at 2s
  so a slow Grafana cannot become a 30s lambda timeout.
- **Delta temporality.** Cumulative counters from short-lived Lambda containers
  read as a reset storm to Mimir.
- **Off is a valid state.** No endpoint means the OTel SDK is never `require`d,
  so local dev and tests neither export nor pay the load cost.
- **Quiet in tests.** `NODE_ENV=test` defaults `LOG_LEVEL` to `error`, so the
  access log does not drown jest output.

## Cost

The OTel SDK adds 245 KB minified to each bundle (528 KB total, 136 KB zipped).
Per invocation: buffered records plus one flush, bounded at 2s.

## Not in scope

- Traces / Tempo.
- Terraform changes. Preview stacks inherit the OTLP vars because
  `preview-env.yml` copies the live lambda environment, so their telemetry
  arrives tagged `pr-<N>` — the same treatment their Sentry errors get.
- Dashboards and alert rules as code. The metric names above are the contract a
  dashboard would build on.
- The frontend. Grafana Faro would be a separate piece of work.
