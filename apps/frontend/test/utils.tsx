import { render, type RenderOptions } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { RbacSubject } from '@branch/rbac';
import { AuthContext, AuthProvider } from '@/context/AuthContext';
import { adminSubject, session } from './rbac';

/**
 * A cache per render, so one test's rows never satisfy the next test's query.
 *
 * `retry: false` because the app retries once by default, which would turn every
 * assertion about a failed request into two stubbed calls and a wait. `gcTime: 0`
 * keeps nothing alive past the render.
 */
export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
    },
  });
}

/**
 * Wraps children in a fresh QueryClientProvider. Exported for the suites that
 * build their own wrapper (AuthContext's, which needs the real provider without
 * Chakra) rather than going through `render` below.
 */
export function TestQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // useState, not a bare call: a new client on every render would reset the
  // cache mid-test and re-trigger every query forever.
  const [client] = useState(makeTestQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Renders with a signed-in admin by default.
 *
 * Components now ask `@branch/rbac` whether the current subject may act, so a
 * page rendered with no session shows every control disabled and a test that
 * only wanted to check a heading fails for the wrong reason. Pass `subject` to
 * render as a director, a project member or nobody, and assert on what they can
 * and cannot reach.
 */
function makeWrapper(subject: RbacSubject | null) {
  const value = subject
    ? session({ subject })
    : session({ subject: undefined, isAuthenticated: false });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <TestQueryProvider>
      <ChakraProvider value={defaultSystem}>
        <AuthContext.Provider
          value={
            {
              ...value,
              login: jest.fn(),
              respondToChallenge: jest.fn(),
              logout: jest.fn(),
              refresh: jest.fn(),
              reloadUser: jest.fn(),
              forgotPassword: jest.fn(),
              resetPassword: jest.fn(),
            } as never
          }
        >
          {children}
        </AuthContext.Provider>
      </ChakraProvider>
      </TestQueryProvider>
    );
  };
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** `null` renders signed out. Defaults to an admin. */
  subject?: RbacSubject | null;
}

const customRender = (ui: ReactElement, { subject = adminSubject(), ...options }: Options = {}) =>
  render(ui, { wrapper: makeWrapper(subject), ...options });

/**
 * Renders with the real `AuthProvider`, which bootstraps from token storage and
 * `GET /auth/me`. Only for tests of the session machinery itself — everything
 * else wants the static subject above, which does not need a stubbed fetch.
 */
export const renderWithLiveAuth = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) =>
  render(ui, {
    wrapper: ({ children }) => (
      <TestQueryProvider>
        <ChakraProvider value={defaultSystem}>
          <AuthProvider>{children}</AuthProvider>
        </ChakraProvider>
      </TestQueryProvider>
    ),
    ...options,
  });

export * from '@testing-library/react';
export { customRender as render };
