import { act } from 'react';
import { render, screen, waitFor } from '../utils';
import ProjectPage from '@/app/projects/[id]/page';

const mockApiFetch = jest.fn();
jest.mock('../../src/lib/api', () => ({
    apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

jest.mock('next/navigation', () => ({
    useParams: () => ({ id: '1' }),
    useRouter: jest.fn(() => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
    })),
    usePathname: jest.fn(() => '/'),
    useSearchParams: jest.fn(() => new URLSearchParams()),
}));

let resolvers: Array<() => void> = [];

beforeEach(() => {
    resolvers = [];
    mockApiFetch.mockImplementation((url: string) => {
        return new Promise((resolve) => {
            resolvers.push(() => {
                if (url === '/projects/1') resolve({ project_id: 1, name: 'Clinician Communication Study', description: 'Test description', total_budget: '500000.00', currency: 'USD', start_date: null, end_date: null, created_at: null });
                if (url === '/projects/1/expenditures') resolve([]);
                if (url === '/projects/1/members') resolve({ ok: true, body: { users: [] } });
            });
        });
    });
});

describe('Project Page', () => {
    it('renders loading state initially', () => {
        render(<ProjectPage />);
        expect(screen.getByText('Loading project...')).toBeInTheDocument();
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

    it('renders the financial cards', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByText('Funding Received')).toBeInTheDocument();
            expect(screen.getByText('Total Spent')).toBeInTheDocument();
            expect(screen.getByText('Total Remaining')).toBeInTheDocument();
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

    it('renders View More and View All buttons', async () => {
        render(<ProjectPage />);
        act(() => resolvers.forEach(r => r()));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /view more/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /view all/i })).toBeInTheDocument();
        });
    });
});