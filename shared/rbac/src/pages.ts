import { GlobalAction } from './policy';

/**
 * Which permission each page of the SPA requires.
 *
 * Lives in the shared package rather than the frontend so the route guard, the
 * navbar and the backend's own notion of "who may reach this area" all read one
 * table. Keys are normalised paths (lowercase, no trailing slash); a page
 * matches its own path and any descendant segment.
 *
 * `GlobalAction` and not `Action`: the guard evaluates these with no resource in
 * hand, so a record-scoped permission here would hard-deny the page for
 * everyone, admins included.
 */
export const PAGE_PERMISSIONS: Record<string, GlobalAction> = {
  '/dashboard': 'dashboard:view',
  '/donors': 'donors:view',
  '/donations': 'donations:view',
  '/expenses': 'expenses:view',
  '/projects': 'projects:view',
  '/reports': 'reports:view',
  '/accounts': 'accounts:view',
};

/**
 * The permission guarding `pathname`, or `undefined` when the page needs only a
 * session.
 *
 * Longest prefix wins, so `/projects/settings` could later require something
 * stricter than `/projects` without reordering the table.
 */
export function pagePermission(pathname: string): GlobalAction | undefined {
  let best: { prefix: string; action: GlobalAction } | undefined;
  for (const [prefix, action] of Object.entries(PAGE_PERMISSIONS)) {
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (!matches) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, action };
  }
  return best?.action;
}
