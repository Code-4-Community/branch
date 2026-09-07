import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { kyselyTelemetryLog } from '../src/db';
import { resetLoggerForTests } from '../src/logger';
import { resetTelemetryForTests } from '../src/provider';

let written: Record<string, unknown>[];

function event(overrides: Record<string, unknown> = {}) {
  return {
    level: 'query' as const,
    queryDurationMillis: 10,
    query: { sql: 'select * from branch.donors where donor_id = $1' },
    ...overrides,
  };
}

beforeEach(() => {
  written = [];
  const record = (line: unknown) => {
    written.push(JSON.parse(String(line)));
  };
  jest.spyOn(console, 'log').mockImplementation(record);
  jest.spyOn(console, 'warn').mockImplementation(record);
  jest.spyOn(console, 'error').mockImplementation(record);
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  // Jest defaults the level to `error`; the slow-query line is a warning.
  process.env.LOG_LEVEL = 'info';
  resetTelemetryForTests();
  resetLoggerForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  resetLoggerForTests();
});

describe('kyselyTelemetryLog', () => {
  it('stays quiet for a fast query', () => {
    kyselyTelemetryLog(event());
    expect(written).toHaveLength(0);
  });

  it('warns once a query crosses the slow threshold', () => {
    kyselyTelemetryLog(event({ queryDurationMillis: 812 }));

    expect(written).toEqual([
      { level: 'warn', message: 'Slow query', 'db.operation.name': 'SELECT', durationMs: 812 },
    ]);
  });

  it('logs a failed query with the error flattened', () => {
    kyselyTelemetryLog(event({ level: 'error', error: new Error('deadlock detected') }));

    expect(written[0]).toMatchObject({
      level: 'error',
      message: 'Query failed',
      'db.operation.name': 'SELECT',
      'error.message': 'deadlock detected',
    });
  });

  it('labels by statement kind only, never by the SQL itself', () => {
    kyselyTelemetryLog(
      event({ queryDurationMillis: 900, query: { sql: '  insert into branch.users values (1)' } }),
    );

    const [line] = written;
    expect(line['db.operation.name']).toBe('INSERT');
    expect(JSON.stringify(line)).not.toContain('branch.users');
  });

  it('does not throw on a missing or odd statement', () => {
    expect(() =>
      kyselyTelemetryLog(event({ queryDurationMillis: 700, query: { sql: '' } })),
    ).not.toThrow();
    expect(written[0]['db.operation.name']).toBe('UNKNOWN');
  });
});
