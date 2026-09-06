import type { Counter, Histogram, Meter } from '@opentelemetry/api';
import { getMeter } from './provider';

export type Attributes = Record<string, string | number | boolean | undefined>;

/**
 * Domain metric names. Kept in one table so a dashboard and the code that feeds
 * it cannot drift, and so nobody invents a second spelling of the same series.
 */
export const METRICS = {
  LOGIN: 'branch.auth.logins',
  REGISTRATION: 'branch.auth.registrations',
  USER_INVITED: 'branch.users.invited',
  PROJECT_CHANGED: 'branch.projects.changed',
  EXPENDITURE_CHANGED: 'branch.expenditures.changed',
  EXPENDITURE_AMOUNT: 'branch.expenditures.amount',
  DONATION_RECORDED: 'branch.donations.recorded',
  DONATION_AMOUNT: 'branch.donations.amount',
  REPORT_GENERATED: 'branch.reports.generated',
  REPORT_DURATION: 'branch.reports.generation.duration',
  REPORT_SIZE: 'branch.reports.size',
} as const;

interface HistogramSpec {
  description: string;
  unit: string;
}

const HISTOGRAM_SPECS: Record<string, HistogramSpec> = {
  'http.server.request.duration': { description: 'Time to serve a request', unit: 'ms' },
  'db.client.operation.duration': { description: 'Time to run a query', unit: 'ms' },
  [METRICS.EXPENDITURE_AMOUNT]: { description: 'Expenditure amounts', unit: 'USD' },
  [METRICS.DONATION_AMOUNT]: { description: 'Donation amounts', unit: 'USD' },
  [METRICS.REPORT_DURATION]: { description: 'Time to render a report', unit: 'ms' },
  [METRICS.REPORT_SIZE]: { description: 'Generated report size', unit: 'By' },
};

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
let boundMeter: Meter | null = null;

function meter(): Meter | null {
  const current = getMeter();
  // A reset (tests) or a late init hands back a different meter; the cached
  // instruments belong to the old one.
  if (current !== boundMeter) {
    counters.clear();
    histograms.clear();
    boundMeter = current;
  }
  return current;
}

function counter(name: string, description: string): Counter | null {
  const m = meter();
  if (!m) return null;

  let instrument = counters.get(name);
  if (!instrument) {
    instrument = m.createCounter(name, { description });
    counters.set(name, instrument);
  }
  return instrument;
}

function histogram(name: string): Histogram | null {
  const m = meter();
  if (!m) return null;

  let instrument = histograms.get(name);
  if (!instrument) {
    const spec = HISTOGRAM_SPECS[name] ?? { description: name, unit: '1' };
    instrument = m.createHistogram(name, spec);
    histograms.set(name, instrument);
  }
  return instrument;
}

/** Drop `undefined` values — OTel rejects them and they are never a useful label. */
function clean(attributes: Attributes = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Every recorder below swallows its own failures. A broken metric must never be
 * the reason a request fails.
 */
function guard(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error('telemetry: metric dropped:', err);
  }
}

export interface RequestMetric {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export function recordRequest({ method, route, statusCode, durationMs }: RequestMetric): void {
  guard(() => {
    const attributes = {
      'http.request.method': method,
      'http.route': route,
      'http.response.status_code': statusCode,
    };
    counter('http.server.requests', 'Requests served')?.add(1, attributes);
    histogram('http.server.request.duration')?.record(durationMs, attributes);
  });
}

export function recordColdStart(): void {
  guard(() => counter('faas.cold_starts', 'Lambda cold starts')?.add(1));
}

/** `reason` is `unauthenticated` or `forbidden` — the two gates in `dispatch`. */
export function recordAuthFailure(method: string, route: string, reason: string): void {
  guard(() =>
    counter('http.server.auth_failures', 'Requests refused by the auth gate')?.add(1, {
      'http.request.method': method,
      'http.route': route,
      reason,
    }),
  );
}

export function recordUnhandledError(method: string, route: string): void {
  guard(() =>
    counter('http.server.unhandled_errors', 'Errors that reached the dispatch catch')?.add(1, {
      'http.request.method': method,
      'http.route': route,
    }),
  );
}

export function recordDbQuery(operation: string, durationMs: number, ok: boolean): void {
  guard(() =>
    histogram('db.client.operation.duration')?.record(durationMs, {
      'db.operation.name': operation,
      'db.outcome': ok ? 'ok' : 'error',
    }),
  );
}

/** Count a domain event. Use a {@link METRICS} constant, not a literal. */
export function recordEvent(name: string, attributes?: Attributes): void {
  guard(() => counter(name, name)?.add(1, clean(attributes)));
}

/** Record a domain measurement (money, duration). Use a {@link METRICS} constant. */
export function recordValue(name: string, value: number, attributes?: Attributes): void {
  if (!Number.isFinite(value)) return;
  guard(() => histogram(name)?.record(value, clean(attributes)));
}
