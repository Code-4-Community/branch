import { AsyncLocalStorage } from 'node:async_hooks';

/** Fields every log line in a request carries, so a Loki query can follow one request. */
export interface RequestContext {
  requestId?: string;
  service: string;
  method: string;
  path: string;
  /** The matched route *pattern* (`/donors/:id`), never the concrete path — Prometheus label cardinality. */
  route?: string;
  userId?: string;
  coldStart: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Fill in what is only known part-way through a request (the route, the caller). */
export function enrichRequestContext(fields: Partial<RequestContext>): void {
  const context = storage.getStore();
  if (context) Object.assign(context, fields);
}
