import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger, resetLoggerForTests } from '../src/logger';
import { runWithRequestContext } from '../src/context';
import { resetTelemetryForTests } from '../src/provider';

const ORIGINAL_ENV = { ...process.env };
let written: string[];

function captured(): Record<string, unknown>[] {
  return written.map((line) => JSON.parse(line));
}

beforeEach(() => {
  written = [];
  const record = (line: unknown) => {
    written.push(String(line));
  };
  jest.spyOn(console, 'log').mockImplementation(record);
  jest.spyOn(console, 'warn').mockImplementation(record);
  jest.spyOn(console, 'error').mockImplementation(record);
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  // Jest defaults the level to `error`; these tests are about the levels below it.
  process.env.LOG_LEVEL = 'info';
  resetTelemetryForTests();
  resetLoggerForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  resetLoggerForTests();
});

describe('logger', () => {
  it('writes one JSON line carrying the level and message', () => {
    logger.info('Report generated', { reportId: 7 });

    expect(captured()).toEqual([{ level: 'info', message: 'Report generated', reportId: 7 }]);
  });

  it('drops debug below the default threshold but keeps it when asked', () => {
    logger.debug('noisy');
    expect(written).toHaveLength(0);

    process.env.LOG_LEVEL = 'debug';
    resetLoggerForTests();
    logger.debug('noisy');
    expect(written).toHaveLength(1);
  });

  it('flattens an Error rather than serialising it to {}', () => {
    logger.error('Query failed', { error: new TypeError('bad input') });

    const [line] = captured();
    expect(line['error.type']).toBe('TypeError');
    expect(line['error.message']).toBe('bad input');
    expect(line['error.stack']).toEqual(expect.stringContaining('TypeError'));
  });

  it('describes a non-Error throw too', () => {
    logger.error('odd', { error: 'a string' });

    const [line] = captured();
    expect(line['error.type']).toBe('string');
    expect(line['error.message']).toBe('a string');
  });

  it('attaches the enclosing request so a Loki query can follow one call', async () => {
    await runWithRequestContext(
      {
        requestId: 'req-1',
        service: 'branch-donors',
        method: 'GET',
        path: '/donors/9',
        route: '/donors/:id',
        userId: '42',
        coldStart: true,
      },
      async () => logger.warn('Slow query', { durationMs: 900 }),
    );

    expect(captured()[0]).toEqual({
      level: 'warn',
      message: 'Slow query',
      service: 'branch-donors',
      'http.request.method': 'GET',
      'url.path': '/donors/9',
      'faas.coldstart': true,
      'aws.request_id': 'req-1',
      'http.route': '/donors/:id',
      'enduser.id': '42',
      durationMs: 900,
    });
  });

  it('survives a circular field instead of throwing inside the logger', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.info('cycle', { circular })).not.toThrow();
    expect(written).toHaveLength(1);
  });
});
