import { render, type RenderOptions } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import type { ReactElement } from 'react';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: Wrapper, ...options });

export * from '@testing-library/react';
export { customRender as render };
