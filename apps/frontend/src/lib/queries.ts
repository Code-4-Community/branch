/**
 * Every cached read in the app, in one place.
 *
 * Two rules make this file worth having:
 *
 *   1. One key per resource. `/projects` was previously fetched by five
 *      independent components, so navigating projects -> donations -> expenses
 *      issued the same request three times. They now share `['projects']` and
 *      the second and third navigations are served from cache.
 *   2. The route prefetcher and the page that renders the data must agree on the
 *      key *and* the fetcher. `RoutePrefetcher` starts a route's queries before
 *      `AuthGate` has let the page mount; if its key differed from the page's by
 *      so much as a number's type, the page would refetch and the prefetch would
 *      be pure waste. Sharing these factories makes that mismatch unexpressible.
 *
 * Deliberately React-free: it calls `authedFetch` rather than `useApi()`, so
 * `RoutePrefetcher` can use it from an effect and so `queryFn`s stay testable.
 */

import { authedFetch } from '@/lib/authClient';
import { normalizePath } from '@/lib/routes';
import type { Donation, Donor, Expenditure, ProjectSummary } from '@/types';

/** A page of rows plus the server's pagination block. */
export interface Paginated<T> {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ReportRow {
  report_id: number;
  project_id: number;
  title: string;
  object_url: string;
  report_type: string;
  date_created: string | null;
  emails?: string[];
}

/** Rows per page, shared so the prefetcher asks for the page the table renders. */
export const ROWS_PER_PAGE = 10;

/** `GET /auth/me`. Owned by `AuthContext`; listed here so the key has one home. */
export const AUTH_ME_KEY = ['auth', 'me'] as const;

interface QuerySpec<T = unknown> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
}

/**
 * `GET /projects` returns a bare array. Callers want different subsets of the
 * row (the navbar needs a name, the cards need the aggregates) but they are all
 * the same request, so they all get the same key.
 */
export function projectsQuery(): QuerySpec<ProjectSummary[]> {
  return {
    queryKey: ['projects'] as const,
    queryFn: async () => {
      const rows = await authedFetch<ProjectSummary[]>('/projects', { method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },
  };
}

/**
 * One page of `GET /expenditures`.
 *
 * `page` and `limit` are numbers in the key, not strings: a key of
 * `['expenditures', 'paged', { page: '1' }]` from the prefetcher would miss
 * `{ page: 1 }` from the page and quietly double every request.
 */
export function expendituresPageQuery(
  page: number,
  limit: number = ROWS_PER_PAGE,
): QuerySpec<Paginated<Expenditure>> {
  return {
    queryKey: ['expenditures', 'paged', { page, limit }] as const,
    queryFn: () =>
      authedFetch<Paginated<Expenditure>>(
        `/expenditures?page=${page}&limit=${limit}`,
        { method: 'GET' },
      ),
  };
}

/**
 * Every expenditure the caller can see.
 *
 * Still needed, and not a leftover: `/expenditures` accepts only `page`, `limit`
 * and `projectId`, so the expenses page's search box, month/type/status filters
 * and sort-by-amount cannot be expressed server-side. Those views fall back to
 * this query and filter in the browser, exactly as before. The default view --
 * the one every cold load pays for -- uses `expendituresPageQuery` instead.
 */
export function expendituresAllQuery(): QuerySpec<Paginated<Expenditure>> {
  return {
    queryKey: ['expenditures', 'all'] as const,
    queryFn: () => authedFetch<Paginated<Expenditure>>('/expenditures', { method: 'GET' }),
  };
}

export function reportsPageQuery(
  page: number,
  limit: number = ROWS_PER_PAGE,
): QuerySpec<Paginated<ReportRow>> {
  return {
    queryKey: ['reports', 'paged', { page, limit }] as const,
    queryFn: () =>
      authedFetch<Paginated<ReportRow>>(`/reports?page=${page}&limit=${limit}`, {
        method: 'GET',
      }),
  };
}

export function donationsQuery(): QuerySpec<Donation[]> {
  return {
    queryKey: ['donations'] as const,
    queryFn: async () => {
      const res = await authedFetch<Paginated<Donation>>('/donors/donations', {
        method: 'GET',
      });
      return res.data ?? [];
    },
  };
}

export function donorsQuery(): QuerySpec<Donor[]> {
  return {
    queryKey: ['donors'] as const,
    queryFn: async () => {
      const res = await authedFetch<Paginated<Donor>>('/donors', { method: 'GET' });
      return res.data ?? [];
    },
  };
}

/**
 * The queries a route needs before it can paint, keyed by normalized pathname.
 *
 * `RoutePrefetcher` walks this; the pages call the very same factories. Adding a
 * route here is the only step needed to take it off the auth waterfall.
 *
 * `search` is passed in so a paginated route prefetches the page the URL asks
 * for rather than always page 1 -- a deep link to `?page=3` would otherwise warm
 * the cache with rows nobody is about to look at.
 */
export const routeQueries: Record<
  string,
  (search: URLSearchParams) => QuerySpec[]
> = {
  '/projects': () => [projectsQuery()],
  '/reports': (search) => [
    reportsPageQuery(pageFrom(search)),
    projectsQuery(),
  ],
  '/donations': () => [donationsQuery(), donorsQuery(), projectsQuery()],
  '/expenses': (search) => [
    // Mirrors the page's own choice of query. A filtered deep link cannot be
    // served by a page request, so prefetch what the page will actually ask for.
    expensesFiltered(search)
      ? expendituresAllQuery()
      : expendituresPageQuery(pageFrom(search)),
    projectsQuery(),
  ],
};

function pageFrom(search: URLSearchParams): number {
  return parseInt(search.get('page') ?? '', 10) || 1;
}

/**
 * Whether the expenses URL carries state the server cannot filter on, which is
 * what forces the full-list query. Kept next to `routeQueries` so the
 * prefetcher and the page cannot drift apart on the decision.
 */
export function expensesFiltered(search: URLSearchParams): boolean {
  if ((search.get('q') ?? '') !== '') return true;
  if (search.get('sort') === 'Amount') return true;
  return ['months', 'types', 'projects', 'statuses'].some(
    (key) => (search.get(key) ?? '') !== '',
  );
}

/** The queries to warm for a pathname, or an empty list for an unmapped route. */
export function queriesForRoute(
  pathname: string,
  search: URLSearchParams,
): QuerySpec[] {
  return routeQueries[normalizePath(pathname)]?.(search) ?? [];
}

export function reportsAllQuery(): QuerySpec<ReportRow[]> {
  return {
    queryKey: ['reports', 'all'] as const,
    queryFn: async () => {
      const res = await authedFetch<Paginated<ReportRow>>('/reports', { method: 'GET' });
      return res.data ?? [];
    },
  };
}