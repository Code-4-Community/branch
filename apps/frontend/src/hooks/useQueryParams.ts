'use client';
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type ParamValue = string | string[];

/**
 * Syncs a flat filter/state object to URL query params.
 *
 * - String values map to plain query params (e.g. `?q=foo`)
 * - String[] values map to comma-separated params (e.g. `?months=Jan,Feb`)
 * - Empty strings and empty arrays are omitted from the URL
 * - Uses router.replace so filter changes don't add browser history entries
 *
 * Usage:
 *   const [params, setParams] = useQueryParams({ q: '', tags: [] as string[] });
 *   setParams({ q: 'hello', tags: ['a', 'b'] });
 */
export function useQueryParams<T extends Record<string, ParamValue>>(
  defaults: T,
): [T, (updates: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults } as T;
    for (const key in defaults) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      if (Array.isArray(defaults[key])) {
        (result as Record<string, ParamValue>)[key] = raw ? raw.split(',') : [];
      } else {
        (result as Record<string, ParamValue>)[key] = raw;
      }
    }
    return result;
  // searchParams identity changes when URL changes, which is the correct dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setParams = useCallback(
    (updates: Partial<T>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const key in updates) {
        const val = updates[key];
        if (val === undefined) continue;
        if (Array.isArray(val)) {
          if (val.length === 0) next.delete(key);
          else next.set(key, val.join(','));
        } else {
          if (!val) next.delete(key);
          else next.set(key, val as string);
        }
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return [values, setParams];
}
