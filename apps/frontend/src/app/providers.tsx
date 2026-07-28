'use client';

import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { AuthProvider } from '@/context/AuthContext';
import AuthGate from './components/AuthGate';

// AuthGate lives here so every route is guarded by construction. Note that
// test/utils.tsx intentionally renders ChakraProvider + AuthProvider WITHOUT
// AuthGate, so page tests can exercise page content in isolation; the gate has
// its own test file.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={defaultSystem}>
      <AuthProvider>
        <AuthGate>{children}</AuthGate>
      </AuthProvider>
    </ChakraProvider>
  );
}
