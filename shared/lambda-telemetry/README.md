# @branch/lambda-telemetry

Metrics and structured logs from the lambdas to Grafana Cloud, over OTLP/HTTP.

Terraform has set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`
on all six functions since the Grafana account was created; until this package
existed nothing read them. This is the thing that reads them.

## What you get for free

`dispatch()` in `@branch/lambda-http` is instrumented, so **every route in every
service** already reports:

| Signal | Name | Labels |
|---|---|---|
| Requests served | `http.server.requests` | method, route, status |
| Latency | `http.server.request.duration` (ms) | method, route, status |
| Cold starts | `faas.cold_starts` | — |
| Refused by the auth gate | `http.server.auth_failures` | method, route, `unauthenticated` \| `forbidden` |
| Errors reaching the dispatch catch | `http.server.unhandled_errors` | method, route |
| Query latency | `db.client.operation.duration` (ms) | statement kind, ok/error |

plus one `Request served` log line per request, carrying the request id, route,
status, duration, cold-start flag and the caller's user id.

Wiring a lambda needs nothing beyond what is already there, except the Kysely
hook in `db.ts`:

```ts
import { kyselyTelemetryLog } from '@branch/lambda-telemetry';

const db = new Kysely<DB>({ log: kyselyTelemetryLog, dialect: ... });
```

## Domain metrics

Anything business-shaped is recorded explicitly from a controller, using a name
from the `METRICS` table — never a string literal, so a dashboard and the code
feeding it cannot drift apart:

```ts
import { METRICS, recordEvent, recordValue } from '@branch/lambda-telemetry';

recordEvent(METRICS.LOGIN, { outcome: 'failure' });
recordValue(METRICS.DONATION_AMOUNT, 250);
```

`recordEvent` counts; `recordValue` records a measurement into a histogram whose
unit is declared in `HISTOGRAM_SPECS`.

## Logging

```ts
import { logger } from '@branch/lambda-telemetry';

logger.info('Report generated', { reportId: 7 });
logger.error('Upload failed', { error: err });
```

Each call writes one JSON line to stdout (so CloudWatch is unchanged) **and**
one OTel log record to Loki. The enclosing request's fields are attached
automatically — controllers never pass a request id by hand. An `error` field
holding an `Error` is flattened into `error.type` / `error.message` /
`error.stack` rather than serialising to `{}`.

`serverError()` from `@branch/lambda-http` already logs this way, so a catch
block that uses it needs nothing further.

## Rules this package follows

- **Never break a request.** Every recorder and the flush swallow their own
  failures. A metrics outage must not become an outage.
- **No unbounded labels.** Route *patterns*, not paths; statement kinds, not
  SQL; no ids, no email addresses. One bad label is one series per row forever.
- **Flush before returning.** Lambda freezes the container the moment the
  handler returns, so `dispatch()` flushes in a `finally`, capped at 2s.
- **Off is a valid state.** With no `OTEL_EXPORTER_OTLP_ENDPOINT` the OTel SDK
  is never even `require`d: local dev, tests and preview stacks log to stdout
  and record nothing. `OTEL_SDK_DISABLED=true` forces the same.

## Environment

| Variable | Effect |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Gateway base URL. **Absent disables the SDK.** |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key=value,...`, percent-decoded. Carries the Grafana instance id and token. |
| `OTEL_SDK_DISABLED` | `true` disables export, keeping stdout logs. |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. Defaults to `info`, or `error` under `NODE_ENV=test`. |
| `OTEL_SERVICE_NAME` | Overrides `service.name`, which otherwise follows `AWS_LAMBDA_FUNCTION_NAME`. |
| `SENTRY_ENVIRONMENT` | Reused as `deployment.environment.name`. |

Metrics are exported with **delta** temporality: Lambda containers are
short-lived, and cumulative counters from a churning fleet read as a reset storm
to Mimir.
