import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dev-only convenience proxy. Each backend service owns its full prefixed
  // path (e.g. /projects/:id/members) — no prefix stripping — matching how
  // API Gateway forwards paths in production. Note: lib/api.ts's apiFetch calls
  // the per-service ports directly, so these rewrites are a fallback for
  // same-origin relative requests only.
  async rewrites() {
    return [
      { source: '/auth/:path*', destination: 'http://localhost:3006/auth/:path*' },
      { source: '/users/:path*', destination: 'http://localhost:3001/users/:path*' },
      { source: '/projects/:path*', destination: 'http://localhost:3002/projects/:path*' },
      { source: '/donors/:path*', destination: 'http://localhost:3003/donors/:path*' },
      { source: '/expenditures/:path*', destination: 'http://localhost:3004/expenditures/:path*' },
      { source: '/reports/:path*', destination: 'http://localhost:3005/reports/:path*' },
    ];
  },
};

export default nextConfig;
