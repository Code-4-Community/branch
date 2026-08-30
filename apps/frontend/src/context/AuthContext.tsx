'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ANONYMOUS, type RbacSubject } from '@branch/rbac';
import { ApiError, apiFetch } from '@/lib/api';
import { AUTH_ME_KEY } from '@/lib/queries';
import {
  authedFetch,
  endSession,
  onSessionExpired,
  refreshSession,
} from '@/lib/authClient';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getTokenExpMs,
  saveTokens,
} from '@/lib/authTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The signed-in user, as reported by GET /auth/me.
 *
 * IMPORTANT: `isAdmin` is NOT a JWT claim. It lives only in Postgres
 * (`branch.users.is_admin`) and there is no pre-token-generation trigger, so
 * decoding the ID token can never yield it. A Cognito *access* token does not
 * carry `email` or `name` either. GET /auth/me is therefore the only source of
 * truth for identity and role — do not "optimise" it away in favour of decoding
 * a token locally.
 */
export interface AuthUser {
  userId: number;
  cognitoSub: string;
  email: string;
  name: string;
  isAdmin: boolean;
  profileImage?: string | null;
  /**
   * The authorization subject, built server-side by the same code the lambdas
   * authorize with. It is the only reason the browser can answer "may they?"
   * without a second round trip, and the reason it answers it identically.
   *
   * Required: `isValidUser` rejects a payload without it rather than degrading
   * into a signed-in session that is denied everything.
   */
  rbac: RbacSubject;
}

export type ChallengeName =
  | 'NEW_PASSWORD_REQUIRED'
  | 'SOFTWARE_TOKEN_MFA'
  | 'SMS_MFA'
  | 'EMAIL_OTP'
  | 'SELECT_MFA_TYPE';

export type LoginResult =
  | { status: 'authenticated' }
  | {
      status: 'challenge';
      challengeName: ChallengeName;
      session: string;
      email: string;
    };

export interface ChallengeResponseInput {
  challengeName: ChallengeName;
  session: string;
  email: string;
  /** NEW_PASSWORD_REQUIRED */
  newPassword?: string;
  /** SOFTWARE_TOKEN_MFA / SMS_MFA / EMAIL_OTP — no UI for these yet. */
  code?: string;
  /** SELECT_MFA_TYPE */
  mfaType?: string;
  /** Optional display name, when the pool requires the attribute. */
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Prefer `usePermissions()` over reading this directly. */
  subject: RbacSubject;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  respondToChallenge: (input: ChallengeResponseInput) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  reloadUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<void>;
}

/*
 * Deliberately absent: register / verifyEmail / resendCode.
 *
 * BRANCH has no self-serve signup by design. It is an internal tool with an
 * admin-managed roster, and `is_admin` lives in Postgres — a self-registered
 * user would authenticate but have no meaningful authorization. The backend no
 * longer serves /auth/register, /auth/verify-email or /auth/resend-code at all:
 * the pool sets allow_admin_create_user_only, so Cognito SignUp is refused.
 * Onboarding is admin-invite via POST /users, which calls AdminCreateUser with a
 * temporary password — that path returns NEW_PASSWORD_REQUIRED, which the login
 * page handles, and marks the email verified server-side so no
 * verification-code screen is needed.
 *
 * Please don't re-add these to the context without a matching UI; they were
 * previously exposed here and called from nowhere.
 */

/** Raw shape of POST /auth/login and /auth/respond-challenge (PascalCase). */
interface AuthRawResponse {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ChallengeName?: ChallengeName;
  Session?: string;
}

/** Refresh this many ms before the access token actually expires. */
const REFRESH_LEAD_MS = 120_000;
const MIN_REFRESH_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Guards against a malformed or empty /auth/me payload being treated as a session.
 *
 * `rbac` is required, not optional. Without it the session would still look
 * signed in while every permission evaluated against ANONYMOUS -- an empty
 * navbar and the no-access panel on every page, indistinguishable from an
 * account that had been stripped. That is a reachable state, because the
 * frontend and the auth lambda deploy from separate workflows and the browser
 * can be newer than the API. Failing the bootstrap sends the user to /login,
 * which is at least honest about the session being unusable.
 */
function isValidUser(candidate: unknown): candidate is AuthUser {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const user = candidate as AuthUser;
  if (typeof user.cognitoSub !== 'string') return false;
  const rbac = user.rbac;
  return (
    typeof rbac === 'object' &&
    rbac !== null &&
    Array.isArray(rbac.memberProjectIds) &&
    Array.isArray(rbac.directorProjectIds)
  );
}

/**
 * Exported for the test harness only, which provides a session directly rather
 * than standing up token storage and a fake `GET /auth/me` for every page test.
 * Application code uses `useAuth()`; there is one provider, mounted in
 * `providers.tsx`.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  /**
   * Whether storage holds anything worth asking the server about.
   *
   * `null` is "not looked yet", and it is load-bearing twice over. It is read in
   * an effect rather than during render because `output: 'export'` prerenders
   * this tree at build time: deciding from storage during render would make the
   * prerendered HTML that of a signed-out visitor, so the static document on S3
   * would contain protected page content instead of the spinner. It also keeps
   * `isLoading` true across the first flush, so AuthGate cannot mistake
   * "haven't checked" for "signed out" and bounce a returning user to /login.
   */
  const [hasStoredSession, setHasStoredSession] = useState<boolean | null>(null);

  useEffect(() => {
    setHasStoredSession(Boolean(getAccessToken() || getRefreshToken()));
  }, []);

  const fetchMe = useCallback(() => authedFetch<AuthUser>('/auth/me'), []);

  /** Writes the session straight into the cache, the one source of `user`. */
  const setUser = useCallback(
    (next: AuthUser | null) => {
      queryClient.setQueryData(AUTH_ME_KEY, next);
    },
    [queryClient],
  );

  /**
   * Session bootstrap. Server-verified rather than "trust the local ID token",
   * so a revoked or expired session no longer looks signed in.
   *
   * A query rather than an effect so that the rest of the app can read the same
   * cache entry, and so `reloadUser` and the login path can seed it without a
   * second copy of the state living here.
   */
  const meQuery = useQuery({
    queryKey: AUTH_ME_KEY,
    // Anonymous visitors make zero network calls: `enabled` false leaves the
    // query idle rather than merely discarding its result.
    enabled: hasStoredSession === true,
    // The session is re-read explicitly (`reloadUser`) and rewritten by every
    // path that changes it, so a background refetch could only add requests.
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const me = await fetchMe();
        return isValidUser(me) ? me : null;
      } catch {
        // Resolving null rather than rejecting preserves the original contract:
        // a failed bootstrap is a signed-out session, not an error to render.
        clearTokens();
        return null;
      }
    },
  });

  const user = meQuery.data ?? null;

  /**
   * `isPending`, not `isLoading`: for one render after `enabled` flips true the
   * fetch has not started yet, and `isLoading` is false in that window. AuthGate
   * would read that single frame as "resolved, signed out" and redirect a
   * perfectly good session to /login.
   */
  const isLoading =
    hasStoredSession === null || (hasStoredSession && meQuery.isPending);

  // Any endSession() anywhere — including from a background request — collapses
  // into user === null, which AuthGate turns into a redirect.
  useEffect(
    () =>
      onSessionExpired(() => {
        setHasStoredSession(false);
        setUser(null);
      }),
    [setUser],
  );

  // Proactive refresh, rescheduled from each new token's exp. Without this the
  // session silently breaks after the access token's 1-hour lifetime.
  useEffect(() => {
    if (!user) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const exp = getTokenExpMs(getAccessToken());
      if (exp === null) return;
      const delay = Math.max(
        exp - Date.now() - REFRESH_LEAD_MS,
        MIN_REFRESH_DELAY_MS,
      );
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (await refreshSession()) schedule();
        else endSession();
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  /**
   * Turns a raw auth response into a LoginResult.
   *
   * Both login and respondToChallenge funnel through here, which is what makes a
   * challenge chained *after* NEW_PASSWORD_REQUIRED (the normal TOTP-enrollment
   * path) already work at this layer — only a UI step would be missing. It also
   * throws when tokens are absent instead of persisting `undefined`, which used
   * to write the literal string "undefined" into storage and report success.
   */
  const consumeAuthResponse = useCallback(
    async (data: AuthRawResponse, email: string): Promise<LoginResult> => {
      if (data.ChallengeName) {
        if (!data.Session) {
          throw new Error('Login challenge returned without a session');
        }
        return {
          status: 'challenge',
          challengeName: data.ChallengeName,
          session: data.Session,
          email,
        };
      }

      if (!data.AccessToken || !data.IdToken || !data.RefreshToken) {
        throw new Error('Login response did not include tokens');
      }

      saveTokens({
        accessToken: data.AccessToken,
        idToken: data.IdToken,
        refreshToken: data.RefreshToken,
      });

      try {
        const me = await fetchMe();
        if (!isValidUser(me)) throw new Error('Malformed /auth/me response');
        setUser(me);
        setHasStoredSession(true);
      } catch {
        // Never leave a half-session behind: tokens present but no known user.
        clearTokens();
        setUser(null);
        throw new Error(
          'Signed in but could not load your profile. Please try again.',
        );
      }

      return { status: 'authenticated' };
    },
    [fetchMe, setUser],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const data = await apiFetch<AuthRawResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      return consumeAuthResponse(data, email);
    },
    [consumeAuthResponse],
  );

  const respondToChallenge = useCallback(
    async (input: ChallengeResponseInput): Promise<LoginResult> => {
      const data = await apiFetch<AuthRawResponse>('/auth/respond-challenge', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return consumeAuthResponse(data, input.email);
    },
    [consumeAuthResponse],
  );

  const logout = useCallback(async () => {
    // retryOn401: false — refreshing a session we are discarding is pointless.
    await authedFetch('/auth/logout', {
      method: 'POST',
      retryOn401: false,
    }).catch(() => {
      // Best effort: clear locally even if the server call fails.
    });
    endSession();
    setUser(null);
  }, [setUser]);

  const reloadUser = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(isValidUser(me) ? me : null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endSession();
        setUser(null);
        return;
      }
      throw error;
    }
  }, [fetchMe, setUser]);

  const forgotPassword = useCallback(async (email: string) => {
    await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword }),
      });
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user != null,
        isAdmin: user?.isAdmin ?? false,
        subject: user?.rbac ?? ANONYMOUS,
        isLoading,
        login,
        respondToChallenge,
        logout,
        refresh: refreshSession,
        reloadUser,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
