import { render, screen, waitFor } from '../utils';
import DashboardPage from '@/app/dashboard/page';
import type { DashboardResponse } from '@/types/dashboard';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
  ...jest.requireActual('../../src/lib/authClient'),
  authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

const response: DashboardResponse = {
  year: 2026,
  summary: {
    topExpenseCategory: {
      category: 'Visitor/Honorarium',
      amount: 90000,
      percentage: 30,
    },
    totalSpent: 300000,
    totalProjects: 6,
    averageSpendPerProject: 12000,
  },
  projects: [
    { project_id: 1, name: 'Alpha', total_budget: 100000, currency: 'USD', spent: 30000, staff_count: 3, spent_percentage: 30 },
    { project_id: 2, name: 'Beta', total_budget: 100000, currency: 'USD', spent: 30000, staff_count: 3, spent_percentage: 30 },
    { project_id: 3, name: 'Gamma', total_budget: 100000, currency: 'USD', spent: 30000, staff_count: 3, spent_percentage: 30 },
    { project_id: 4, name: 'Delta', total_budget: 100000, currency: 'USD', spent: 10000, staff_count: 1, spent_percentage: 10 },
  ],
  expensesByMonth: [
    { month: '2026-01', category: 'General', amount: 4000 },
    { month: '2026-01', category: 'Travel', amount: 2000 },
    { month: '2026-05', category: 'Visitor/Honorarium', amount: 1000 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue(response);
});

describe('Dashboard Page', () => {
  it('reads the admin dashboard aggregate rather than the plain project list', async () => {
    render(<DashboardPage />);
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/projects/dashboard',
        expect.anything(),
      ),
    );
  });

  it('renders the four summary figures with their captions', async () => {
    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('TOP EXPENSE CATEGORY')).toBeInTheDocument(),
    );
    // Also the chart legend's lightest band, hence getAllByText.
    expect(screen.getAllByText('Visitor/Honorarium').length).toBeGreaterThan(0);
    expect(screen.getByText('30% of expenses')).toBeInTheDocument();

    expect(screen.getByText('TOTAL SPENT')).toBeInTheDocument();
    expect(screen.getByText('$300,000')).toBeInTheDocument();
    expect(screen.getByText('this year')).toBeInTheDocument();

    expect(screen.getByText('TOTAL PROJECTS')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('active projects')).toBeInTheDocument();

    expect(screen.getByText('AVG SPEND/PROJECT')).toBeInTheDocument();
    expect(screen.getByText('$12,000')).toBeInTheDocument();
    expect(screen.getByText('per project')).toBeInTheDocument();
  });

  it('previews three projects and links the rest behind View All', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Delta')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /View All/ })).toHaveAttribute(
      'href',
      '/projects',
    );
  });

  it('renders the expenses chart with every category in the legend', async () => {
    render(<DashboardPage />);

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Total Expenses' }),
      ).toBeInTheDocument(),
    );
    for (const label of ['General', 'Travel', 'Travel Foreign']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('falls back to a placeholder when nothing has been spent', async () => {
    mockApiFetch.mockResolvedValue({
      ...response,
      summary: { ...response.summary, topExpenseCategory: null },
    });
    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('no expenses yet')).toBeInTheDocument(),
    );
  });

  it('surfaces a load failure instead of rendering empty cards', async () => {
    mockApiFetch.mockRejectedValue(new Error('Admin access required'));
    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('Admin access required')).toBeInTheDocument(),
    );
    expect(screen.queryByText('TOTAL SPENT')).not.toBeInTheDocument();
  });
});
