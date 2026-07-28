/**
 * The single owner of token storage.
 *
 * Nothing else in the app should touch `localStorage` for auth — a
 * `grep -rn "branch_access_token" src/` should only ever match this file.
 * Reading the key directly is how pages ended up sending unauthenticated
 * requests: `localStorage.getItem(...) ?? ''` produces an empty string, and an
 * empty token makes `apiFetch` silently omit the Authorization header.
 */

export const STORAGE_KEYS = {
  ACCESS: 'branch_access_token',
  ID: 'branch_id_token',
  REFRESH: 'branch_refresh_token',
} as const;

/**
 * `output: 'export'` prerenders client components at build time, so every
 * accessor has to tolerate the absence of `window` or `next build` fails.
 */
function readKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-browsing modes can throw on localStorage access.
    return null;
  }
}

export function getAccessToken(): string | null {
  return readKey(STORAGE_KEYS.ACCESS);
}

export function getIdToken(): string | null {
  return readKey(STORAGE_KEYS.ID);
}

export function getRefreshToken(): string | null {
  return readKey(STORAGE_KEYS.REFRESH);
}

export interface StoredTokens {
  accessToken: string;
  idToken: string;
  /**
   * Optional on purpose. POST /auth/refresh returns only AccessToken and IdToken
   * — Cognito does not re-issue a refresh token on REFRESH_TOKEN_AUTH — so
   * refresh responses must not overwrite the stored one with `undefined`.
   */
  refreshToken?: string;
}

export function saveTokens({
  accessToken,
  idToken,
  refreshToken,
}: StoredTokens): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken);
    window.localStorage.setItem(STORAGE_KEYS.ID, idToken);
    if (refreshToken) {
      window.localStorage.setItem(STORAGE_KEYS.REFRESH, refreshToken);
    }
  } catch {
    // Storage unavailable — the session simply won't survive a reload.
  }
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.ACCESS);
    window.localStorage.removeItem(STORAGE_KEYS.ID);
    window.localStorage.removeItem(STORAGE_KEYS.REFRESH);
  } catch {
    // Nothing useful to do.
  }
}

/**
 * Decodes a JWT payload without verifying it.
 *
 * Only used to read `exp` for refresh scheduling. Identity and `isAdmin` come
 * from GET /auth/me — `is_admin` lives solely in Postgres and is not a token
 * claim, so it can never be recovered from here.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

/** Token expiry as epoch milliseconds, or null if it cannot be determined. */
export function getTokenExpMs(token: string | null): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000;
}

/**
 * True when the token is already expired or will be within `skewMs`.
 * Lets callers refresh pre-emptively instead of spending a round trip on a
 * request that is guaranteed to 401.
 */
export function isExpiredOrExpiring(
  token: string | null,
  skewMs = 30_000,
): boolean {
  const exp = getTokenExpMs(token);
  // An undecodable token is treated as usable: let the server be the judge
  // rather than locking the user out over a parsing quirk.
  if (exp === null) return false;
  return exp - skewMs <= Date.now();
}
