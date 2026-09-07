import { identity, levelRank, type LogLevel } from './config';
import { currentRequestContext } from './context';
import { getOtelLogger } from './provider';

const SEVERITY: Record<LogLevel, number> = { debug: 5, info: 9, warn: 13, error: 17 };

let threshold: number | undefined;

function minLevel(): number {
  if (threshold === undefined) threshold = levelRank(identity().logLevel);
  return threshold;
}

export interface LogFields {
  /** An `Error` here is flattened into `error.type` / `error.message` / `error.stack`. */
  error?: unknown;
  [field: string]: unknown;
}

/**
 * One JSON line to stdout (CloudWatch) and one record to Loki. The enclosing
 * request's id, route and caller are attached automatically.
 */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (levelRank(level) < minLevel()) return;

  const attributes = { ...requestFields(), ...flatten(fields) };

  try {
    const line = JSON.stringify({ level, message, ...attributes });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } catch {
    // Something in `fields` is circular. The message alone still beats silence.
    console.log(JSON.stringify({ level, message }));
  }

  try {
    getOtelLogger()?.emit({
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      body: message,
      attributes,
    });
  } catch (err) {
    console.error('telemetry: log record dropped:', err);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => log('debug', message, fields),
  info: (message: string, fields?: LogFields) => log('info', message, fields),
  warn: (message: string, fields?: LogFields) => log('warn', message, fields),
  error: (message: string, fields?: LogFields) => log('error', message, fields),
};

function requestFields(): Record<string, string | number | boolean> {
  const context = currentRequestContext();
  if (!context) return {};

  const fields: Record<string, string | number | boolean> = {
    service: context.service,
    'http.request.method': context.method,
    'url.path': context.path,
    'faas.coldstart': context.coldStart,
  };
  if (context.requestId) fields['aws.request_id'] = context.requestId;
  if (context.route) fields['http.route'] = context.route;
  if (context.userId) fields['enduser.id'] = context.userId;
  return fields;
}

function flatten(fields: LogFields): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'error' || value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = safeStringify(value);
    }
  }

  if ('error' in fields) Object.assign(out, describeError(fields.error));
  return out;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describeError(err: unknown): Record<string, string> {
  if (err instanceof Error) {
    return {
      'error.type': err.name,
      'error.message': err.message,
      ...(err.stack ? { 'error.stack': err.stack } : {}),
    };
  }
  return { 'error.type': typeof err, 'error.message': String(err) };
}

/** Tests only — re-reads `LOG_LEVEL`. */
export function resetLoggerForTests(): void {
  threshold = undefined;
}
