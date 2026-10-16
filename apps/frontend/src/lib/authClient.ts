import { ApiError, apiFetch } from './api';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isExpiredOrExpiring,
  saveTokens,
} from './authTokens';

/**
 * Session-aware fetch, deliberately outside React.
 *
 * It imports `api` but never React or `next/navigation`, and `AuthContext`
 * imports it — so the graph stays one-way:
 *
 *   api.ts  <-  authClient.ts  <-  AuthContext.tsx / hooks/useApi.ts
 *
 * Session death is announced upward through a listener registry rather than by
 * navigating here, so there is exactly one redirect code path in the app
 * (AuthGate reacting to `user === null`) regardless of what killed the session.
 */

interface RefreshResponse {
  AccessToken?: string;
  IdToken?: string;
}

type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/** Subscribe to session death. Returns an unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Clears stored tokens and notifies subscribers. Safe to call repeatedly. */
export function endSession(): void {
  clearTokens();
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error('onSessionExpired listener threw:', error);
    }
  }
}

/**
 * `rejected`: the server refused the refresh token, so the session is over.
 * `unavailable`: network failure, 5xx or 429; the refresh token may still be good.
 */
export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

function isAuthRejection(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403].includes(error.status);
}

/**
 * Exchanges the stored refresh token for a new access/ID token pair.
 *
 * Single-flight: concurrent callers share one in-flight request, so a burst of
 * simultaneous 401s produces exactly one POST /auth/refresh rather than one per
 * request.
 */
export function refreshSessionOutcome(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;

  const attempt = (async (): Promise<RefreshOutcome> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return 'rejected';

    try {
      // apiFetch, not authedFetch: this call carries no bearer token and must
      // never recurse back into the refresh path.
      const data = await apiFetch<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      if (!data?.AccessToken || !data?.IdToken) return 'rejected';

      // No refreshToken here on purpose — Cognito does not return a new one, and
      // saveTokens leaves the stored value alone when it is absent.
      saveTokens({ accessToken: data.AccessToken, idToken: data.IdToken });
      return 'ok';
    } catch (error) {
      return isAuthRejection(error) ? 'rejected' : 'unavailable';
    }
  })();

  refreshInFlight = attempt;
  void attempt.finally(() => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  });

  return attempt;
}

/** Resolves true only when new tokens were stored. */
export async function refreshSession(): Promise<boolean> {
  return (await refreshSessionOutcome()) === 'ok';
}

/** Ends the session only when the server refused it; a transient failure keeps the tokens. */
async function refreshOrThrow(): Promise<void> {
  const outcome = await refreshSessionOutcome();
  if (outcome === 'ok') return;
  if (outcome === 'rejected') {
    endSession();
    throw new ApiError('Session expired', 401);
  }
  throw new ApiError('Could not reach the server. Check your connection and try again.', 503);
}

export interface AuthedRequestOptions extends RequestInit {
  /** Set false to skip the refresh-and-retry dance (used when signing out). */
  retryOn401?: boolean;
}

/**
 * Performs a request with the caller's access token attached, refreshing it when
 * needed. At most one refresh and one retry per call.
 */
export async function authedFetch<T>(
  path: string,
  { retryOn401 = true, ...options }: AuthedRequestOptions = {},
): Promise<T> {
  let token = getAccessToken();

  if (!token && !getRefreshToken()) {
    endSession();
    throw new ApiError('Not authenticated', 401);
  }

  // Pre-emptive refresh: skips a round trip that would certainly 401.
  if (!token || isExpiredOrExpiring(token)) {
    await refreshOrThrow();
    token = getAccessToken();
  }

  try {
    return await apiFetch<T>(path, { ...options, token: token ?? undefined });
  } catch (error) {
    const isUnauthorized = error instanceof ApiError && error.status === 401;
    if (!isUnauthorized || !retryOn401) throw error;

    await refreshOrThrow();

    // Retry through apiFetch directly, so a second 401 propagates to the caller
    // instead of looping.
    return await apiFetch<T>(path, {
      ...options,
      token: getAccessToken() ?? undefined,
    });
  }
}

/** Test-only: drops any in-flight refresh so state does not leak between cases. */
export function __resetRefreshStateForTests(): void {
  refreshInFlight = null;
  listeners.clear();
}
