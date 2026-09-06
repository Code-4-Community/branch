import { logger } from './logger';
import { recordDbQuery } from './metrics';

/** The shape of a Kysely `LogEvent`, restated so this package needs no kysely dep. */
interface QueryLogEvent {
  level: 'query' | 'error';
  queryDurationMillis: number;
  query: { sql: string };
  error?: unknown;
}

/** Queries slower than this get their own log line. */
const SLOW_QUERY_MS = 500;

/**
 * Kysely `log` hook: one duration histogram per statement kind, plus a line for
 * anything slow or failed.
 *
 * Wire it in a lambda's `db.ts`:
 * `new Kysely({ dialect, log: kyselyTelemetryLog })`
 */
export function kyselyTelemetryLog(event: QueryLogEvent): void {
  const operation = statementKind(event.query?.sql);
  const durationMs = Math.round(event.queryDurationMillis ?? 0);
  const ok = event.level !== 'error';

  recordDbQuery(operation, durationMs, ok);

  if (!ok) {
    logger.error('Query failed', { 'db.operation.name': operation, durationMs, error: event.error });
  } else if (durationMs >= SLOW_QUERY_MS) {
    logger.warn('Slow query', { 'db.operation.name': operation, durationMs });
  }
}

/**
 * The leading keyword, which is low-cardinality. The SQL itself is deliberately
 * never a label: it embeds ids and would blow up the series count.
 */
function statementKind(sql: string | undefined): string {
  const word = sql?.trimStart().split(/\s+/, 1)[0]?.toUpperCase();
  return word && /^[A-Z]+$/.test(word) ? word : 'UNKNOWN';
}
