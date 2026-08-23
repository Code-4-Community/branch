'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authorizeAny } from '@branch/rbac';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  DEFAULT_LANDING_PATH,
  LOGIN_PATH,
  classifyRoute,
  landingPathFor,
  pagePermission,
} from '@/lib/routes';
import FullPageSpinner from './FullPageSpinner';

/**
 * The app's only route guard, mounted once in `providers.tsx`. A per-page
 * wrapper has to be remembered on every new page and cannot stop protected UI
 * from painting for a frame; `middleware.ts` is unavailable under
 * `output: 'export'`.
 *
 * Two mechanisms, on purpose:
 *   1. an effect that navigates, and
 *   2. early returns that keep the protected tree from mounting at all, so
 *      protected pages never fire their data-fetch effects while signed out.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, subject, isLoading } = useAuth();
  const { subject: rbacSubject } = usePermissions();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const access = classifyRoute(pathname);
  const required = pagePermission(pathname);

  useEffect(() => {
    // No redirect before the session has been resolved, or a returning user
    // would be bounced to /login during their own bootstrap.
    if (isLoading) return;

    if (access === 'protected' && !isAuthenticated) {
      const search =
        typeof window !== 'undefined' ? window.location.search : '';
      const next = encodeURIComponent(`${pathname}${search}`);
      router.replace(`${LOGIN_PATH}?next=${next}`);
      return;
    }

    if (access === 'public' && isAuthenticated) {
      router.replace(landingPathFor(subject));
    }
  }, [isLoading, isAuthenticated, subject, access, pathname, router]);

  if (isLoading) return <FullPageSpinner />;

  // Render suppression — the redirect above is asynchronous, and without these
  // the protected page would mount and start fetching in the meantime.
  if (access === 'protected' && !isAuthenticated) return <FullPageSpinner />;
  if (access === 'public' && isAuthenticated) return <FullPageSpinner />;

  // An explanation in place rather than a redirect: bouncing can loop if the
  // role changes mid-session. The backend enforces the same permission on every
  // route the page would have called, so this is the courtesy layer.
  if (access === 'protected' && required) {
    const decision = authorizeAny(rbacSubject, required);
    if (!decision.allowed) return <NoAccessPanel reason={decision.reason} />;
  }

  return <>{children}</>;
}

function NoAccessPanel({ reason }: { reason?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: '#f9fafb',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2E6038' }}>
        You don&apos;t have access to this page
      </h1>
      <p style={{ color: '#4b5563', maxWidth: 420 }}>
        {reason ?? 'This section is limited to administrators.'} If you think you
        should have access, ask an admin to update your account.
      </p>
      <a
        href={DEFAULT_LANDING_PATH}
        style={{ color: '#2E6038', textDecoration: 'underline' }}
      >
        Back to projects
      </a>
    </div>
  );
}
