'use client';

import { useState } from 'react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { makeQueryClient } from '@/lib/queryClient';
import AuthGate from './components/AuthGate';
import RoutePrefetcher from './components/RoutePrefetcher';

// AuthGate lives here so every route is guarded by construction. Note that
// test/utils.tsx intentionally renders ChakraProvider + AuthProvider WITHOUT
// AuthGate, so page tests can exercise page content in isolation; the gate has
// its own test file.
//
// QueryClientProvider sits above AuthProvider because GET /auth/me is itself a
// cached query. RoutePrefetcher sits above AuthGate because it has to run while
// that query is still in flight -- see its own file for why.
export function Providers({ children }: { children: React.ReactNode }) {
  // Per-mount, not module-level: a client shared across renders would leak one
  // user's cache into the next in tests and in any future SSR pass.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <RoutePrefetcher />
      <ChakraProvider value={defaultSystem}>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}
