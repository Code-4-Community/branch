/**
 * Route access policy.
 *
 * Deliberately protected-by-default: any new page under `src/app/` is gated
 * without anyone remembering to opt in. That is the property that keeps the
 * "anonymous visitor sees the admin shell" bug from recurring — the previous
 * design had no guard at all, so every page was implicitly public.
 */

export type RouteAccess = 'public' | 'protected' | 'bootstrap';

export const LOGIN_PATH = '/login';

/**
 * Landing route when nothing more specific applies. Must stay reachable by every
 * role — it was `/dashboard`, which dropped non-admins on the no-access panel
 * once that page became admin-only. Prefer `landingPathFor()` when the role is known.
 */
export const DEFAULT_LANDING_PATH = '/projects';
export const ADMIN_LANDING_PATH = '/dashboard';

export function landingPathFor(isAdmin: boolean): string {
  return isAdmin ? ADMIN_LANDING_PATH : DEFAULT_LANDING_PATH;
}

/**
 * Link to a single project.
 *
 * The id is a query param rather than a path segment on purpose. The app is a
 * static export, so a dynamic `/projects/[id]` segment would have to enumerate
 * every id at build time — impossible for database rows — leaving real ids with
 * no exported document and depending on a CloudFront fallback to serve some
 * other page's shell. `/projects?id=1` is one prerendered document that reads
 * the id at runtime, so deep links and refreshes work with no hosting rules.
 */
export function projectPath(id: number | string): string {
  return `/projects?id=${encodeURIComponent(String(id))}`;
}

/** Reachable without a session. Authenticated users get bounced off these. */
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
] as const;

/**
 * Require `isAdmin` on top of authentication.
 *
 * `/expenses` is deliberately not here: non-admins submit expenses and read
 * their own submissions there. Only the approve/deny controls and admin notes
 * inside the review modal are admin-gated, and the backend already lets any
 * authenticated user list expenditures.
 */
const ADMIN_PREFIXES = ['/dashboard', '/reports', '/accounts'] as const;

/**
 * Strips the trailing slash and lowercases.
 *
 * Required, not cosmetic: `next.config.ts` sets `trailingSlash: true`, so
 * `usePathname()` yields `/login/` in production but `/login` in dev and tests.
 * Comparing raw pathnames passes every test and then misroutes in production.
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const lower = pathname.toLowerCase();
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, '') : lower;
  return trimmed === '' ? '/' : trimmed;
}

/** True when `path` equals `prefix` or is a descendant segment of it. */
function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function classifyRoute(pathname: string): RouteAccess {
  const path = normalizePath(pathname);
  if (path === '/') return 'bootstrap';
  if (PUBLIC_PREFIXES.some((prefix) => matchesPrefix(path, prefix)))
    return 'public';
  return 'protected';
}

export function requiresAdmin(pathname: string): boolean {
  const path = normalizePath(pathname);
  return ADMIN_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/**
 * Validates a `?next=` redirect target.
 *
 * Only same-origin absolute paths are accepted, so a crafted login link cannot
 * bounce a freshly-authenticated user to an attacker's site. Rejects
 * protocol-relative (`//evil.com`), absolute URLs, and backslash tricks that
 * some browsers normalise to slashes.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = DEFAULT_LANDING_PATH,
): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.includes('\\')) return fallback;
  if (raw.includes('://')) return fallback;
  return raw;
}
