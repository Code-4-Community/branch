'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/authTokens';
import { queriesForRoute } from '@/lib/queries';

/**
 * Starts a route's data requests in parallel with `GET /auth/me`.
 *
 * Mounted in `providers.tsx` *outside* `AuthGate`, which is the entire trick.
 * The gate renders a spinner until the session resolves, so no page component
 * mounts and no page effect runs until then -- giving every cold load a hard
 * two-round-trip floor (`/auth/me`, then the page's own call), each trip
 * potentially paying a Lambda cold start. This component is not behind the gate,
 * so its effect fires on the first flush and the two trips overlap. When the
 * gate does unblock, the page's `useQuery` finds a warm cache.
 *
 * Why not hydrate `user` from a cached `/auth/me` payload instead? That also
 * removes the wait, but a signed-out visitor with stale storage would briefly
 * see admin navigation before the server corrected them. Authorization is
 * enforced server-side so nothing leaks, but it is a bad enough appearance bug
 * to rule the approach out. Prefetching buys the same parallelism with no
 * false UI.
 *
 * Renders nothing.
 */
export default function RoutePrefetcher() {
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    // Without a token these requests can only 401, so an anonymous visitor
    // makes no more calls than before. Storage is the only session signal
    // available this early -- asking `useAuth()` would reintroduce the wait
    // this component exists to remove.
    if (!getAccessToken()) return;

    // `window.location.search` rather than `useSearchParams()`: the hook forces
    // the nearest boundary to suspend under `output: 'export'`, and this
    // component must not suspend anything -- it renders no UI and its whole
    // value is being early.
    const search = new URLSearchParams(window.location.search);

    for (const spec of queriesForRoute(pathname, search)) {
      // Honours the default staleTime, so a repeat visit to a warm route is a
      // no-op rather than a duplicate request.
      void queryClient.prefetchQuery(spec);
    }
  }, [pathname, queryClient]);

  return null;
}
