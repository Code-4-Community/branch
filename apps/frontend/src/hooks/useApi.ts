'use client';

import { useMemo } from 'react';
import { authedFetch, type AuthedRequestOptions } from '@/lib/authClient';

/**
 * Authenticated API surface for components.
 *
 * Prefer this over reading a token out of storage and threading it through
 * props: it always uses the current token, and it refreshes transparently on
 * expiry instead of surfacing a raw 401.
 */
export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  request<T>(path: string, options?: AuthedRequestOptions): Promise<T>;
}

const api: Api = {
  get: (path) => authedFetch(path, { method: 'GET' }),
  post: (path, body) =>
    authedFetch(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  patch: (path, body) =>
    authedFetch(path, {
      method: 'PATCH',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  put: (path, body) =>
    authedFetch(path, {
      method: 'PUT',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  del: (path) => authedFetch(path, { method: 'DELETE' }),
  request: (path, options) => authedFetch(path, options),
};

/**
 * Returns a stable `Api`. The identity never changes, so it is safe to list in a
 * `useEffect` dependency array — which matters because several pages already
 * depend on their fetch helper there and a fresh object each render would loop.
 */
export function useApi(): Api {
  return useMemo(() => api, []);
}
