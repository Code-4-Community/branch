'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  sub: string;
  email: string;
  name?: string;
}

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface NewPasswordChallenge {
  challengeName: 'NEW_PASSWORD_REQUIRED';
  session: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<NewPasswordChallenge | void>;
  setPassword: (email: string, session: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Backend response shapes
// ---------------------------------------------------------------------------

interface LoginResponse {
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
}

type LoginResult = LoginResponse | NewPasswordChallenge;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  ACCESS: 'branch_access_token',
  ID: 'branch_id_token',
  REFRESH: 'branch_refresh_token',
} as const;

function decodeIdToken(token: string): User | null {
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    const claims = JSON.parse(json);
    return {
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? claims['cognito:username'],
    };
  } catch {
    return null;
  }
}

function saveTokens({ accessToken, idToken, refreshToken }: AuthTokens) {
  localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken);
  localStorage.setItem(STORAGE_KEYS.ID, idToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH, refreshToken);
}

function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS);
  localStorage.removeItem(STORAGE_KEYS.ID);
  localStorage.removeItem(STORAGE_KEYS.REFRESH);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const idToken = localStorage.getItem(STORAGE_KEYS.ID);
    if (idToken) {
      setUser(decodeIdToken(idToken));
    }
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string): Promise<NewPasswordChallenge | void> {
    const data = await apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if ('challengeName' in data) {
      return data as NewPasswordChallenge;
    }

    const tokens: AuthTokens = {
      accessToken: (data as LoginResponse).AccessToken,
      idToken: (data as LoginResponse).IdToken,
      refreshToken: (data as LoginResponse).RefreshToken,
    };
    saveTokens(tokens);
    setUser(decodeIdToken(tokens.idToken));
  }

  async function setPassword(email: string, session: string, newPassword: string) {
    const data = await apiFetch<LoginResponse>('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ email, session, newPassword }),
    });
    const tokens: AuthTokens = {
      accessToken: data.AccessToken,
      idToken: data.IdToken,
      refreshToken: data.RefreshToken,
    };
    saveTokens(tokens);
    setUser(decodeIdToken(tokens.idToken));
  }

  async function logout() {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS);
    if (accessToken) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        token: accessToken,
      }).catch(() => {
        // Best-effort — clear locally even if the server call fails
      });
    }
    clearTokens();
    setUser(null);
  }

  function getAccessToken() {
    return localStorage.getItem(STORAGE_KEYS.ACCESS);
  }

  
  async function forgotPassword(email: string) {
    await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async function resetPassword(email: string, code: string, newPassword: string) {
    await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
  }


  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        setPassword,
        logout,
        getAccessToken,
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
