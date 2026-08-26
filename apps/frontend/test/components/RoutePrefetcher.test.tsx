/**
 * The two performance claims this PR makes, as assertions rather than prose.
 *
 *   1. A page's data request starts while GET /auth/me is still in flight.
 *      Before, AuthGate held every page unmounted until the session resolved, so
 *      the two calls were strictly sequential.
 *   2. The five components that read `/projects` issue one request between them.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import RoutePrefetcher from '@/app/components/RoutePrefetcher';
import { Providers } from '@/app/providers';
import { projectsQuery } from '@/lib/queries';
import { STORAGE_KEYS } from '@/lib/authTokens';
import { makeQueryClient } from '@/lib/queryClient';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
let currentPath = '/projects';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

/** A JWT-shaped access token that expires an hour from now. */
function accessToken() {
  const payload = btoa(
    JSON.stringify({ sub: 's', exp: Math.floor(Date.now() / 1000) + 3600 }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
}

const ME = {
  userId: 1,
  cognitoSub: 's',
  email: 'a@b.c',
  name: 'Ada',
  isAdmin: true,
  rbac: { userId: 1, isAdmin: true, memberProjectIds: [], directorProjectIds: [] },
};

const PROJECTS = [
  { project_id: 1, name: 'Alpha', is_active: true, total_spent: 0, member_count: 1 },
];

/** Records the order calls arrive in and lets a test hold /auth/me open. */
function stubFetch({ holdAuthMe = false } = {}) {
  const calls: string[] = [];
  let releaseAuthMe: () => void = () => {};
  const authMeGate = new Promise<void>((resolve) => {
    releaseAuthMe = resolve;
  });

  global.fetch = jest.fn(async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    calls.push(path);
    if (path === '/auth/me' && holdAuthMe) await authMeGate;
    const body = path === '/projects' ? PROJECTS : ME;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { calls, releaseAuthMe: () => releaseAuthMe() };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  currentPath = '/projects';
});

describe('RoutePrefetcher', () => {
  it('issues no request for a visitor with no stored token', async () => {
    const { calls } = stubFetch();

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <RoutePrefetcher />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(calls).toEqual([]));
  });

  it('warms the route\'s query so a later consumer makes no request of its own', async () => {
    localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken());
    const { calls } = stubFetch();
    // The app's real defaults on purpose: `staleTime` is precisely the claim
    // under test, and a test-only client with staleTime 0 would refetch and
    // report a failure the app does not have.
    const client = makeQueryClient();

    function ProjectsConsumer() {
      const { data } = useQuery(projectsQuery());
      return <div data-testid="count">{data?.length ?? 'pending'}</div>;
    }

    const view = render(
      <QueryClientProvider client={client}>
        <RoutePrefetcher />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(calls.filter((c) => c === '/projects')).toHaveLength(1),
    );

    // The consumer mounts after the prefetch landed, exactly as a page does when
    // AuthGate finally unblocks it.
    view.rerender(
      <QueryClientProvider client={client}>
        <RoutePrefetcher />
        <ProjectsConsumer />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('count')).toHaveTextContent('1');
    expect(calls.filter((c) => c === '/projects')).toHaveLength(1);
  });
});

describe('the auth waterfall', () => {
  it('starts the page request before GET /auth/me has resolved', async () => {
    localStorage.setItem(STORAGE_KEYS.ACCESS, accessToken());
    const { calls, releaseAuthMe } = stubFetch({ holdAuthMe: true });

    render(
      <Providers>
        <div data-testid="page">projects</div>
      </Providers>,
    );

    // The claim: /projects is in flight while /auth/me is still blocked, so the
    // two round trips overlap instead of queueing.
    await waitFor(() => expect(calls).toContain('/projects'));
    expect(calls).toContain('/auth/me');
    expect(screen.queryByTestId('page')).not.toBeInTheDocument();

    releaseAuthMe();

    // And the gate still does its job: the page appears only once auth resolves.
    expect(await screen.findByTestId('page')).toBeInTheDocument();
  });
});
