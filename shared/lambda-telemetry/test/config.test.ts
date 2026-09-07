import { describe, expect, it } from '@jest/globals';
import { identity, parseHeaders, readConfig } from '../src/config';

describe('readConfig', () => {
  it('is null without an endpoint, so an unconfigured lambda never loads the SDK', () => {
    expect(readConfig({})).toBeNull();
  });

  it('is null when the SDK is explicitly disabled', () => {
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example', OTEL_SDK_DISABLED: 'true' };
    expect(readConfig(env)).toBeNull();
  });

  it('appends the signal paths to the gateway base url', () => {
    const config = readConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example/otlp/' });
    expect(config?.metricsUrl).toBe('https://otlp.example/otlp/v1/metrics');
    expect(config?.logsUrl).toBe('https://otlp.example/otlp/v1/logs');
  });

  it('names the service after the lambda function', () => {
    const config = readConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example',
      AWS_LAMBDA_FUNCTION_NAME: 'branch-donors',
      SENTRY_ENVIRONMENT: 'production',
    });
    expect(config?.serviceName).toBe('branch-donors');
    expect(config?.environment).toBe('production');
  });
});

describe('parseHeaders', () => {
  it('splits the OTLP header list and percent-decodes values', () => {
    expect(parseHeaders('Authorization=Basic%20abc,X-Scope-OrgID=42')).toEqual({
      Authorization: 'Basic abc',
      'X-Scope-OrgID': '42',
    });
  });

  it('keeps a value containing "=" intact', () => {
    expect(parseHeaders('Authorization=Basic dGVzdA==')).toEqual({
      Authorization: 'Basic dGVzdA==',
    });
  });

  it('ignores blanks and malformed pairs rather than throwing', () => {
    expect(parseHeaders(undefined)).toEqual({});
    expect(parseHeaders('novalue,=orphan,a=1')).toEqual({ a: '1' });
  });
});

describe('identity', () => {
  it('falls back to development defaults off Lambda', () => {
    expect(identity({})).toEqual({
      serviceName: 'branch-local',
      serviceVersion: 'dev',
      environment: 'development',
      region: 'us-east-2',
      logLevel: 'info',
    });
  });

  it('rejects an unknown LOG_LEVEL instead of silencing everything', () => {
    expect(identity({ LOG_LEVEL: 'chatty' }).logLevel).toBe('info');
    expect(identity({ LOG_LEVEL: 'DEBUG' }).logLevel).toBe('debug');
  });

  it('quiets the access log under jest, but still obeys an explicit level', () => {
    expect(identity({ NODE_ENV: 'test' }).logLevel).toBe('error');
    expect(identity({ NODE_ENV: 'test', LOG_LEVEL: 'info' }).logLevel).toBe('info');
  });
});
