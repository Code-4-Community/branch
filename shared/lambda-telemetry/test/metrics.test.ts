import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  METRICS,
  recordAuthFailure,
  recordColdStart,
  recordEvent,
  recordRequest,
  recordUnhandledError,
  recordValue,
} from '../src/metrics';
import { getMeter, resetTelemetryForTests } from '../src/provider';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetTelemetryForTests();
});

describe('recorders with no exporter', () => {
  beforeEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    resetTelemetryForTests();
  });

  it('are no-ops rather than throwing, so local dev is unaffected', () => {
    expect(() => {
      recordColdStart();
      recordRequest({ method: 'GET', route: '/donors/:id', statusCode: 200, durationMs: 12 });
      recordAuthFailure('GET', '/donors/:id', 'forbidden');
      recordUnhandledError('GET', '/donors/:id');
      recordEvent(METRICS.LOGIN, { outcome: 'success' });
      recordValue(METRICS.DONATION_AMOUNT, 250);
    }).not.toThrow();
  });
});

describe('recorders with an exporter', () => {
  beforeEach(() => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
    resetTelemetryForTests();
  });

  it('records against the live meter without throwing', () => {
    expect(getMeter()).not.toBeNull();
    expect(() => {
      recordRequest({ method: 'POST', route: '/donors', statusCode: 201, durationMs: 40 });
      recordEvent(METRICS.REPORT_GENERATED, { report_type: 'technical', outcome: 'success' });
      recordValue(METRICS.DONATION_AMOUNT, 500, { currency: 'USD' });
    }).not.toThrow();
  });

  it('drops a non-finite measurement instead of poisoning the histogram', () => {
    expect(() => recordValue(METRICS.DONATION_AMOUNT, Number.NaN)).not.toThrow();
    expect(() => recordValue(METRICS.EXPENDITURE_AMOUNT, Number.POSITIVE_INFINITY)).not.toThrow();
  });

  it('skips undefined attributes, which OTel would reject', () => {
    expect(() =>
      recordEvent(METRICS.LOGIN, { outcome: 'success', challenge: undefined }),
    ).not.toThrow();
  });
});
