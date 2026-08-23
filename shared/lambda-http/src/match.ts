/**
 * Match a route pattern against a path. Patterns use `:name` for params, e.g.
 * `/projects/:id/members`. Returns captured params on match, or `null` if no match.
 * Segment counts must be equal (no greedy/optional segments).
 */
export function matchPattern(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pSeg = pattern.split('/').filter(Boolean);
  const aSeg = path.split('/').filter(Boolean);
  if (pSeg.length !== aSeg.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i++) {
    const p = pSeg[i];
    const a = aSeg[i];
    if (p.startsWith(':')) {
      if (!a) return null;
      params[p.slice(1)] = decodeURIComponent(a);
    } else if (p !== a) {
      return null;
    }
  }
  return params;
}
