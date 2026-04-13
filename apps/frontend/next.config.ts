import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: 'http://localhost:3006/auth/:path*',
      },
      {
        source: '/expenditures/:path*',
        destination: 'http://localhost:3004/expenditures/:path*',
      },
      {
        source: '/expenditures',
        destination: 'http://localhost:3004/expenditures',
      },
      {
        source: '/projects/:path*',
        destination: 'http://localhost:3002/projects/:path*',
      },
      {
        source: '/projects',
        destination: 'http://localhost:3002/projects',
      },
    ];
  },
};

export default nextConfig;
