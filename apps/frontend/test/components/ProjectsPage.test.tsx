import { render, screen, waitFor } from '../utils';
import ProjectsListPage from '@/app/projects/page';
import DashboardPage from '@/app/dashboard/page';

const mockAuthedFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
    ...jest.requireActual('../../src/lib/authClient'),
    authedFetch: (...args: Parameters<typeof mockAuthedFetch>) => mockAuthedFetch(...args),
}));

const dashboard = {
    summary: {
        topExpenseCategory: { category: 'Travel', amount: 6800 },
        totalSpent: 13700,
        totalProjects: 2,
        averageSpendPerProject: 6850,
    },
    projects: [
        {
            project_id: 1,
            name: 'Clinician Communication Study',
            total_budget: 500000,
            currency: 'USD',
            spent: 9200,
            staff_count: 2,
            spent_percentage: 1.84,
        },
        {
            project_id: 4,
            name: 'Proj B',
            total_budget: null,
            currency: 'USD',
            spent: 0,
            staff_count: 0,
            spent_percentage: 0,
        },
    ],
    expensesByMonth: [],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockAuthedFetch.mockImplementation((url: string) => {
        if (url === '/auth/me') {
            return Promise.resolve({ userId: 1, email: 'ashley@branch.org', name: 'Ashley Duggan', isAdmin: true });
        }
        if (url === '/projects/dashboard') return Promise.resolve(dashboard);
        return Promise.reject(new Error(`unexpected request: ${url}`));
    });
});

describe.each([
    ['Projects index', ProjectsListPage],
    ['Dashboard', DashboardPage],
])('%s', (_name, Page) => {
    it('reads its project cards from GET /projects/dashboard', async () => {
        render(<Page />);
        await waitFor(() => {
            expect(mockAuthedFetch).toHaveBeenCalledWith('/projects/dashboard', { method: 'GET' });
        });
        // The list endpoint carries no spend or staffing, so it must not be the source.
        expect(mockAuthedFetch).not.toHaveBeenCalledWith('/projects', expect.anything());
    });

    it('renders the real spend and staff count, not zeros', async () => {
        render(<Page />);
        expect(
            await screen.findByText((text) => text.includes('9,200') && text.includes('500,000')),
        ).toBeInTheDocument();
        expect(screen.getByText('2 members')).toBeInTheDocument();
        expect(screen.getByText('2%')).toBeInTheDocument();
    });

    it('renders a project with no budget as 0% instead of NaN', async () => {
        render(<Page />);
        expect(await screen.findByText('Proj B')).toBeInTheDocument();
        expect(screen.getByText('0 members')).toBeInTheDocument();
        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('surfaces a failure instead of rendering empty cards', async () => {
        mockAuthedFetch.mockImplementation((url: string) => {
            if (url === '/auth/me') return Promise.resolve({ userId: 1, email: 'a@b.org', name: 'A', isAdmin: false });
            return Promise.reject(new Error('Authentication required'));
        });
        render(<Page />);
        expect(await screen.findByText('Authentication required')).toBeInTheDocument();
    });
});
