import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/expenditures/:path*',
        destination: 'http://localhost:3004/expenditures/:path*',
      },
      {
        source: '/api/expenditures',
        destination: 'http://localhost:3004/expenditures',
      },
    ];
  },
};

export default nextConfig;
