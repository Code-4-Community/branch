import type { NextConfig } from 'next';

// Static export (SPA) — the app is fully client-rendered (JWT in localStorage,
// all data via apiFetch). Output goes to `out/`, hosted on S3 + CloudFront.
// No server: `next.config` rewrites don't run in export, so prod routing to the
// backend is entirely via NEXT_PUBLIC_API_BASE_URL (see src/lib/api.ts).
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true, // emit /route/index.html — clean S3 key mapping
  images: { unoptimized: true }, // no server image optimizer in export
};

export default nextConfig;
