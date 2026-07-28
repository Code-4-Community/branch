'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ApiError, apiFetch } from '@/lib/api';
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
 * The backend still serves POST /auth/register, /auth/verify-email and
 * /auth/resend-code, but BRANCH has no self-serve signup by design. It is an
 * internal tool with an admin-managed roster, and `is_admin` lives in Postgres —
 * a self-registered user would authenticate but have no meaningful authorization.
 * Onboarding is admin-invite instead: an admin creates a `branch.users` row with
 * a NULL `cognito_sub`, and the invitee's first registration claims it (see
 * claim-on-register in lambdas/auth/handler.ts). AdminCreateUser with a
 * temporary password works too — that path returns NEW_PASSWORD_REQUIRED, which
 * the login page handles, and marks the email verified server-side so no
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

/** Guards against a malformed or empty /auth/me payload being treated as a session. */
function isValidUser(candidate: unknown): candidate is AuthUser {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as AuthUser).cognitoSub === 'string'
  );
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(() => authedFetch<AuthUser>('/auth/me'), []);

  // Session bootstrap. Server-verified rather than "trust the local ID token",
  // so a revoked or expired session no longer looks signed in.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Anonymous visitors make zero network calls, so isLoading settles on the
        // first effect flush and no protected UI is ever painted.
        if (!getAccessToken() && !getRefreshToken()) return;
        const me = await fetchMe();
        if (!cancelled) setUser(isValidUser(me) ? me : null);
      } catch {
        clearTokens();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  // Any endSession() anywhere — including from a background request — collapses
  // into user === null, which AuthGate turns into a redirect.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

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
    [fetchMe],
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
  }, []);

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
  }, [fetchMe]);

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
