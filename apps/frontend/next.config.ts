import type { NextConfig } from 'next';

// Static export (SPA) — the app is fully client-rendered (JWT in localStorage,
// all data via apiFetch). Output goes to `out/`, hosted on S3 + CloudFront.
// No server: `next.config` rewrites don't run in export, so prod routing to the
// backend is entirely via NEXT_PUBLIC_API_BASE_URL (see src/lib/api.ts).
//
// PREVIEW_BASE_PATH: set by the preview-env workflow to "/pr-<N>" so ephemeral
// PR previews live under a path prefix on the shared preview CloudFront
// distribution (assets emit under /pr-<N>/_next/... — no collision between PRs).
// Unset for prod builds, so the production deploy path is unchanged.
const previewBasePath = process.env.PREVIEW_BASE_PATH;

// `next dev` inherits `output: 'export'`, and export rejects any dynamic route
// whose param is not listed in generateStaticParams — so /projects/42 throws
// locally even though production serves it fine via the CloudFront SPA
// fallback. Opt out for local runs (see mock-api/README.md); builds and CI
// never set this, so the deployed output is unchanged.
const disableStaticExport = process.env.NEXT_DISABLE_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  ...(disableStaticExport ? {} : { output: 'export' }),
  trailingSlash: true, // emit /route/index.html — clean S3 key mapping
  images: { unoptimized: true }, // no server image optimizer in export
  // basePath already prefixes emitted /_next/* asset URLs, but Next does NOT
  // prefix public/ assets referenced by string src (e.g. "/branch-logo.png").
  // Expose the base path as NEXT_PUBLIC_BASE_PATH so components can prefix those
  // themselves via lib/asset.ts (empty string in prod → unchanged).
  ...(previewBasePath
    ? { basePath: previewBasePath, env: { NEXT_PUBLIC_BASE_PATH: previewBasePath } }
    : {}),
};

export default nextConfig;
