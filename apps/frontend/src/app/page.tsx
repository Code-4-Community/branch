'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_LANDING_PATH,
  LOGIN_PATH,
  landingPathFor,
  normalizePath,
} from '@/lib/routes';
import FullPageSpinner from './components/FullPageSpinner';

/**
 * Root route.
 *
 * This page used to render `<NavBar role="admin" />` unconditionally, which is
 * why opening the site looked like being signed in as an admin. It now renders
 * nothing but a spinner and routes by session.
 *
 * It also absorbs the CloudFront SPA fallback: the distribution rewrites every
 * 403/404 to `/index.html` (see infrastructure/aws/frontend_hosting.tf), so a
 * deep link to a path with no exported document is served *this* document. We
 * detect that and hand the URL back to the client router.
 *
 * Note that landing here is a last resort — the client router can only render
 * routes the export actually emitted, so a path with no document of its own
 * still ends at not-found. That is why per-record pages take the id as a query
 * param (`/projects?id=1`) instead of a path segment: the document exists.
 */

const SPA_FALLBACK_KEY = 'branch_spa_fallback_path';

export default function RootPage() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // usePathname() strips basePath automatically; window.location does not.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const rawPath = window.location.pathname.startsWith(basePath)
      ? window.location.pathname.slice(basePath.length)
      : window.location.pathname;
    const actualPath = normalizePath(rawPath || '/');

    if (actualPath !== '/') {
      // We were served as the SPA fallback for some other URL. Retry it once —
      // if the router cannot resolve it either, it hard-navigates, CloudFront
      // serves this document again, and without the marker that loops forever.
      if (window.sessionStorage.getItem(SPA_FALLBACK_KEY) === actualPath) {
        window.sessionStorage.removeItem(SPA_FALLBACK_KEY);
        setNotFound(true);
        return;
      }
      window.sessionStorage.setItem(SPA_FALLBACK_KEY, actualPath);
      router.replace(`${rawPath}${window.location.search}`);
      return;
    }

    window.sessionStorage.removeItem(SPA_FALLBACK_KEY);

    // A genuine visit to "/". Route by session, but only once it is known.
    if (isLoading) return;
    router.replace(isAuthenticated ? landingPathFor(isAdmin) : LOGIN_PATH);
  }, [isLoading, isAuthenticated, isAdmin, router]);

  if (notFound) return <NotFoundPanel />;
  return <FullPageSpinner />;
}

function NotFoundPanel() {
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
        Page not found
      </h1>
      <p style={{ color: '#4b5563' }}>
        That link doesn&apos;t point anywhere in BRANCH.
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
