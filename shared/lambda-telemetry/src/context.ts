import { AsyncLocalStorage } from 'node:async_hooks';

/** Attached to every log line in the request, so Loki can follow one call. */
export interface RequestContext {
  requestId?: string;
  service: string;
  method: string;
  path: string;
  /** Route *pattern*, never the concrete path — label cardinality. */
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

export function enrichRequestContext(fields: Partial<RequestContext>): void {
  const context = storage.getStore();
  if (context) Object.assign(context, fields);
}
