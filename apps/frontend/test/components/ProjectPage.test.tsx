import { act } from 'react';
import { render, screen, waitFor } from '../utils';
import ProjectPage from '@/app/projects/[id]/page';
import type { ProjectOverview } from '@/types';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/authClient', () => ({
    ...jest.requireActual('../../src/lib/authClient'),
    authedFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

jest.mock('next/navigation', () => ({
    useRouter: jest.fn(() => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
    })),
    usePathname: jest.fn(() => '/projects/1/'),
    useSearchParams: jest.fn(() => new URLSearchParams()),
}));

function makeExpenditure(id: number) {
    return {
        expenditure_id: id,
        project_id: 1,
        entered_by: null,
        amount: '1000.00',
        category: 'Visitor / Honorarium',
        description: null,
        status: 'approved' as const,
        receipt_url: null,
        admin_notes: null,
        spent_on: '2026-01-15',
        created_at: null,
    };
}

function makeMember(id: number) {
    return {
        user_id: id,
        name: `Staff ${id}`,
        email: `staff${id}@example.com`,
        role: 'Student' as const,
        profile_image: null,
    };
}

const overview: ProjectOverview = {
    project: {
        project_id: 1,
        name: 'Clinician Communication Study',
        description: 'Test description',
        total_budget: '500000.00',
        currency: 'USD',
        start_date: '2026-01-01',
        end_date: null,
        created_at: null,
    },
    stats: {
        totalBudget: 500000,
        totalSpent: 200000,
        totalRemaining: 300000,
        spentPercentage: 40,
        totalDonated: 0,
        memberCount: 5,
        expenditureCount: 5,
    },
    // More than the page's preview limits, so the "View All" toggles render.
    members: [1, 2, 3, 4, 5].map(makeMember),
    expenditures: [1, 2, 3, 4, 5].map(makeExpenditure),
    isActive: true,
    canEdit: true,
};

let resolvers: Array<() => void> = [];

beforeEach(() => {
    // The page takes the id from the address bar rather than from useParams,
    // because the static export serves one prerendered shell for every id.
    window.history.replaceState({}, '', '/projects/1/');
    resolvers = [];
    mockApiFetch.mockImplementation((url: string) => {
        return new Promise((resolve) => {
            resolvers.push(() => {
                if (url === '/projects/1/overview') resolve(overview);
                // The Navbar lazily loads this only when its menu is expanded.
                if (url === '/projects') resolve([]);
            });
        });
    });
});

describe('Project Page', () => {
    it('renders loading state initially', () => {
        render(<ProjectPage />);
        expect(screen.getByRole('status', { name: 'Loading project…' })).toBeInTheDocument();
    });

    it('loads the whole page from the single overview endpoint', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Clinician Communication Study' })).toBeInTheDocument();
        });
        expect(mockApiFetch).toHaveBeenCalledWith('/projects/1/overview', { method: 'GET' });
        expect(mockApiFetch).not.toHaveBeenCalledWith('/projects/1/expenditures', expect.anything());
    });

    it('renders the project name as heading', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Clinician Communication Study' })).toBeInTheDocument();
        });
    });

    it('renders the Edit Project button', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /edit project/i })).toBeInTheDocument();
        });
    });

    it('renders the funding totals', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByText('$500,000')).toBeInTheDocument();
        });
        expect(screen.getByText('total')).toBeInTheDocument();
        expect(screen.getByText('$200,000')).toBeInTheDocument();
        expect(screen.getByText('$300,000')).toBeInTheDocument();
        expect(screen.getByText('remaining')).toBeInTheDocument();
        // "spent" labels both the donut and the figure beneath it, as designed.
        expect(screen.getAllByText('spent')).toHaveLength(2);
    });

    it('hides Edit Project when the server says the user cannot edit', async () => {
        mockApiFetch.mockImplementation((url: string) => {
            return new Promise((resolve) => {
                resolvers.push(() => {
                    if (url === '/projects/1/overview') resolve({ ...overview, canEdit: false });
                    if (url === '/projects') resolve([]);
                });
            });
        });

        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Clinician Communication Study' })).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /edit project/i })).not.toBeInTheDocument();
    });

    it('renders the donut percentage from the server-computed stats', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByText('40%')).toBeInTheDocument();
        });
    });

    it('renders the expenses section', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByText('Expenses')).toBeInTheDocument();
        });
    });

    it('renders the staff section', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByText('Staff')).toBeInTheDocument();
        });
    });

    it('renders a View All control for each truncated list', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            // One for staff, one for expenses — both lists exceed their preview.
            expect(screen.getAllByRole('button', { name: /view all/i })).toHaveLength(2);
        });
    });
});
