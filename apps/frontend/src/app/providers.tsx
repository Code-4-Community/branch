'use client';

import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { AuthProvider } from '@/context/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={defaultSystem}>
      <AuthProvider>{children}</AuthProvider>
    </ChakraProvider>
  );
}
