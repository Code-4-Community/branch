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

/** `null` when there is no endpoint; callers then never load the SDK. */
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
  // Jest sets NODE_ENV=test, where a per-request access log is pure noise.
  return nodeEnv === 'test' ? 'error' : 'info';
}

export function levelRank(level: LogLevel): number {
  return LEVELS.indexOf(level);
}
