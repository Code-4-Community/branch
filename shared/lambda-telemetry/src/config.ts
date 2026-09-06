export interface TelemetryConfig {
  metricsUrl: string;
  logsUrl: string;
  headers: Record<string, string>;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  region: string;
  logLevel: LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Parse the OTLP env vars Terraform sets on every lambda.
 *
 * Returns `null` when there is nowhere to export to — local dev, tests, and any
 * preview stack that never got the vars. Callers treat that as "no SDK", not as
 * an error, so the OTel packages are never even required.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): TelemetryConfig | null {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint || env.OTEL_SDK_DISABLED === 'true') return null;

  const base = endpoint.replace(/\/+$/, '');
  return {
    metricsUrl: `${base}/v1/metrics`,
    logsUrl: `${base}/v1/logs`,
    headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    ...identity(env),
  };
}

/** Resource identity, which is also useful when the SDK is off (stdout logs carry it). */
export function identity(env: NodeJS.ProcessEnv = process.env) {
  return {
    serviceName: env.OTEL_SERVICE_NAME || env.AWS_LAMBDA_FUNCTION_NAME || 'branch-local',
    serviceVersion: env.AWS_LAMBDA_FUNCTION_VERSION || 'dev',
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'development',
    region: env.AWS_REGION || 'us-east-2',
    logLevel: parseLevel(env.LOG_LEVEL, env.NODE_ENV),
  };
}

/** `key=value,key2=value2`, values percent-encoded, per the OTLP spec. */
export function parseHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;

  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    if (!key) continue;
    headers[key] = safeDecode(pair.slice(eq + 1).trim());
  }
  return headers;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseLevel(raw: string | undefined, nodeEnv?: string): LogLevel {
  const level = raw?.trim().toLowerCase() as LogLevel | undefined;
  if (level && LEVELS.includes(level)) return level;
  // Jest sets NODE_ENV=test. An access log per request is the point in prod and
  // pure noise in a test run, so default it down rather than make every lambda's
  // jest config say so.
  return nodeEnv === 'test' ? 'error' : 'info';
}

export function levelRank(level: LogLevel): number {
  return LEVELS.indexOf(level);
}
