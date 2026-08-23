/**
 * The `/projects` request count for a projects -> donations -> expenses walk.
 *
 * Five components read that endpoint (the projects list, the navbar flyout, and
 * the donations, expenses and reports pages). Each used to own its own
 * `useEffect` + `useState`, so the walk below issued three identical requests
 * and every later navigation issued them again. They now share one query key.
 *
 * This is the assertion behind the number quoted in the PR description, so it
 * deliberately drives the real page components through one QueryClient rather
 * than testing the cache in the abstract.
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { authedFetch } from '@/lib/authClient';
import { makeQueryClient } from '@/lib/queryClient';
import ProjectListView from '@/app/projects/ProjectListView';
import DonationsPage from '@/app/donations/page';
import ExpensePage from '@/app/expenses/page';
import { AuthContext } from '@/context/AuthContext';
import { adminSubject, session } from '../rbac';

jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/projects',
  useSearchParams: () => new URLSearchParams(),
}));

const PROJECTS = [
  { project_id: 1, name: 'Alpha', is_active: true, total_spent: 0, member_count: 2, total_budget: '100' },
];

/** Counts requests by path so the assertion can be about `/projects` alone. */
function stubApi() {
  const counts: Record<string, number> = {};
  (authedFetch as jest.Mock).mockImplementation((path: string) => {
    const key = path.split('?')[0];
    counts[key] = (counts[key] ?? 0) + 1;
    if (key === '/projects') return Promise.resolve(PROJECTS);
    return Promise.resolve({ data: [], pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 1 } });
  });
  return counts;
}

const authValue = {
  ...session({ subject: adminSubject() }),
  login: jest.fn(),
  respondToChallenge: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
  reloadUser: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
} as never;

beforeEach(() => {
  jest.clearAllMocks();
});

it('fetches /projects once across a projects -> donations -> expenses walk', async () => {
  const counts = stubApi();
  // One client for the whole walk, which is what a real SPA session has.
  const client = makeQueryClient();

  const wrap = (ui: React.ReactElement) => (
    <QueryClientProvider client={client}>
      <ChakraProvider value={defaultSystem}>
        <AuthContext.Provider value={authValue}>{ui}</AuthContext.Provider>
      </ChakraProvider>
    </QueryClientProvider>
  );

  const view = render(wrap(<ProjectListView />));
  expect(await screen.findByText('Alpha')).toBeInTheDocument();

  view.rerender(wrap(<DonationsPage />));
  await waitFor(() => expect(counts['/donors/donations']).toBe(1));

  view.rerender(wrap(<ExpensePage />));
  await waitFor(() => expect(counts['/expenditures']).toBe(1));

  // Was 3 — one per page. The navbar flyout would have made it 4.
  expect(counts['/projects']).toBe(1);
});
