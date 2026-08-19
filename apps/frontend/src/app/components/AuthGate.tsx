'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_LANDING_PATH,
  LOGIN_PATH,
  classifyRoute,
  landingPathFor,
  requiresAdmin,
} from '@/lib/routes';
import FullPageSpinner from './FullPageSpinner';

/**
 * The app's only route guard.
 *
 * Mounted once in `providers.tsx` rather than per page. A `useRequireAuth()`
 * hook or a per-page `<ProtectedRoute>` wrapper would both have to be remembered
 * on every new page — the same class of omission that left the entire app
 * unguarded in the first place — and neither can stop protected UI from painting
 * for a frame. `middleware.ts` is not an option: `output: 'export'` means there
 * is no server to run it.
 *
 * Two mechanisms, on purpose:
 *   1. an effect that navigates, and
 *   2. early returns that keep the protected tree from mounting at all, so
 *      protected pages never fire their data-fetch effects while signed out.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const access = classifyRoute(pathname);

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
      router.replace(landingPathFor(isAdmin));
    }
  }, [isLoading, isAuthenticated, isAdmin, access, pathname, router]);

  if (isLoading) return <FullPageSpinner />;

  // Render suppression — the redirect above is asynchronous, and without these
  // the protected page would mount and start fetching in the meantime.
  if (access === 'protected' && !isAuthenticated) return <FullPageSpinner />;
  if (access === 'public' && isAuthenticated) return <FullPageSpinner />;

  // Non-admins get an explanation in place rather than a redirect: bouncing them
  // can loop if the admin flag changes mid-session, and "page not found" would
  // be a lie. This is also what makes the Navbar's role filtering more than
  // cosmetic — hiding a link never stopped anyone typing the URL.
  if (access === 'protected' && requiresAdmin(pathname) && !isAdmin) {
    return <NoAccessPanel />;
  }

  return <>{children}</>;
}

function NoAccessPanel() {
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
        This section is limited to administrators. If you think you should have
        access, ask an admin to update your account.
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
