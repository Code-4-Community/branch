import type { Meter } from '@opentelemetry/api';
import type { Logger as OtelLogger } from '@opentelemetry/api-logs';
import { readConfig, type TelemetryConfig } from './config';

interface Providers {
  meter: Meter;
  otelLogger: OtelLogger;
  flush: () => Promise<unknown>;
}

// `undefined` = not tried yet, `null` = no OTLP endpoint or the SDK failed to load.
let providers: Providers | null | undefined;
let config: TelemetryConfig | null | undefined;

const FLUSH_TIMEOUT_MS = 2_000;
const EXPORT_TIMEOUT_MS = 5_000;

/** How long the exporters batch before shipping on their own. We force-flush per invocation. */
const BATCH_INTERVAL_MS = 60_000;

export function telemetryConfig(): TelemetryConfig | null {
  if (config === undefined) config = readConfig();
  return config;
}

/**
 * Build the OTel providers on first use, or return `null` forever if there is no
 * endpoint. The SDK is `require`d lazily so an unconfigured lambda never pays to
 * load it, and an SDK that throws on init degrades to stdout-only logging rather
 * than taking the request with it.
 */
function getProviders(): Providers | null {
  if (providers !== undefined) return providers;

  const cfg = telemetryConfig();
  if (!cfg) {
    providers = null;
    return null;
  }

  try {
    providers = build(cfg);
  } catch (err) {
    console.error('telemetry: OTel init failed, continuing without it:', err);
    providers = null;
  }
  return providers;
}

function build(cfg: TelemetryConfig): Providers {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const {
    OTLPMetricExporter,
    AggregationTemporalityPreference,
  } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const resource = resourceFromAttributes({
    'service.name': cfg.serviceName,
    'service.namespace': 'branch',
    'service.version': cfg.serviceVersion,
    'deployment.environment.name': cfg.environment,
    'cloud.provider': 'aws',
    'cloud.platform': 'aws_lambda',
    'cloud.region': cfg.region,
    'faas.name': cfg.serviceName,
  });

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        // Lambda instances are short-lived, so cumulative counters would look
        // like a reset storm to Mimir. Delta lets the gateway do the summing.
        exporter: new OTLPMetricExporter({
          url: cfg.metricsUrl,
          headers: cfg.headers,
          timeoutMillis: EXPORT_TIMEOUT_MS,
          temporalityPreference: AggregationTemporalityPreference.DELTA,
        }),
        exportIntervalMillis: BATCH_INTERVAL_MS,
        exportTimeoutMillis: EXPORT_TIMEOUT_MS,
      }),
    ],
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: cfg.logsUrl,
          headers: cfg.headers,
          timeoutMillis: EXPORT_TIMEOUT_MS,
        }),
        { scheduledDelayMillis: BATCH_INTERVAL_MS },
      ),
    ],
  });

  return {
    meter: meterProvider.getMeter('@branch/lambda-telemetry'),
    otelLogger: loggerProvider.getLogger('@branch/lambda-telemetry'),
    flush: () => Promise.all([meterProvider.forceFlush(), loggerProvider.forceFlush()]),
  };
}

export function getMeter(): Meter | null {
  return getProviders()?.meter ?? null;
}

export function getOtelLogger(): OtelLogger | null {
  return getProviders()?.otelLogger ?? null;
}

/**
 * Ship whatever is buffered. Lambda freezes the instance the moment the handler
 * returns, so nothing that is not flushed here is ever seen.
 *
 * Never rejects and never blocks longer than {@link FLUSH_TIMEOUT_MS}: Grafana
 * being slow must not turn into a 30s lambda timeout.
 */
export async function flushTelemetry(): Promise<void> {
  const active = providers;
  if (!active) return;

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      active.flush(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error('telemetry: flush failed:', err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Tests only — drops the memoised providers so a new env can be picked up. */
export function resetTelemetryForTests(): void {
  providers = undefined;
  config = undefined;
}
