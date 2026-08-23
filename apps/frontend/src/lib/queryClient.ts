import { QueryClient } from '@tanstack/react-query';

/**
 * Defaults chosen for an internal tool whose data changes on the order of
 * minutes, not seconds.
 *
 * `staleTime` is the whole point of the cache and is deliberately not 0. At the
 * library default every navigation back to a page refetches, which is the bug
 * this replaces -- the cache would hold the data and then throw the round trip
 * anyway. A minute of staleness across a projects -> donations -> expenses
 * round trip is invisible to the user; three identical `GET /projects` calls
 * were not.
 *
 * `refetchOnWindowFocus` is off because alt-tabbing back to a table is not a
 * request for fresh data, and every writing path already invalidates the keys
 * it dirtied.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
