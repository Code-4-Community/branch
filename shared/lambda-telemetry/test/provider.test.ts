import { afterEach, describe, expect, it } from '@jest/globals';
import { flushTelemetry, resetTelemetryForTests, telemetryConfig } from '../src/provider';
import { getMeter, getOtelLogger } from '../src/provider';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetTelemetryForTests();
});

describe('providers, unconfigured', () => {
  it('hands back nothing and flushing is a no-op', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    resetTelemetryForTests();

    expect(telemetryConfig()).toBeNull();
    expect(getMeter()).toBeNull();
    expect(getOtelLogger()).toBeNull();
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});

describe('providers, configured', () => {
  // Exercises the real OTel constructors: an SDK API change shows up here as a
  // null meter rather than as silently missing metrics in production.
  it('builds a meter and a logger from the OTLP env vars', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Basic%20abc';
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'branch-donors';
    resetTelemetryForTests();

    expect(getMeter()).not.toBeNull();
    expect(getOtelLogger()).not.toBeNull();
  });

  it('resolves even though the collector is unreachable', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
    resetTelemetryForTests();

    getMeter()?.createCounter('test.counter').add(1);
    await expect(flushTelemetry()).resolves.toBeUndefined();
  }, 15_000);
});
