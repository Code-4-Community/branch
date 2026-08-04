import { render, screen, waitFor, within } from '../utils';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/app/reports/page';
import { authedFetch as apiFetch } from '@/lib/authClient';

jest.mock('../../src/lib/authClient', () => ({
    ...jest.requireActual('../../src/lib/authClient'),
    authedFetch: jest.fn(),
}));

jest.mock('../../src/hooks/useQueryParams', () => ({
    useQueryParams: jest.fn(() => [{ page: '' }, jest.fn()]),
}));

// apiFetch is cast inline at each call site below, matching AddExpenseModal.test.tsx convention

const mockReports = [
    {
        report_id: 1,
        project_id: 1,
        title: 'Clinician Communication Study Report',
        object_url: 'https://s3.amazonaws.com/branch-reports/report-1.pdf',
        report_type: 'technical',
        date_created: '2026-06-01',
    },
    {
        report_id: 2,
        project_id: 2,
        title: 'Health Education Initiative Report',
        object_url: 'https://s3.amazonaws.com/branch-reports/report-2.docx',
        report_type: 'narrative',
        date_created: '2026-06-02',
    },
];

const mockProjects = [
    { project_id: 1, name: 'Clinician Communication Study' },
    { project_id: 2, name: 'Health Education Initiative' },
];

function mockApiFetchImplementation({
    reports = mockReports,
    projects = mockProjects,
}: { reports?: typeof mockReports; projects?: typeof mockProjects } = {}) {
    (apiFetch as jest.Mock).mockImplementation((endpoint: string) => {
        if (endpoint === '/reports') {
            return Promise.resolve({ data: reports });
        }
        if (endpoint === '/projects') {
            return Promise.resolve(projects);
        }
        return Promise.resolve({});
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('branch_access_token', 'test-token');
});

describe('ReportsPage', () => {
    it('renders the heading', async () => {
        mockApiFetchImplementation();
        render(<ReportsPage />);
        expect(screen.getByRole('heading', { name: 'Reports', level: 1 })).toBeInTheDocument();
        await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/reports', expect.anything()));
    });

    it('renders a row for each fetched report', async () => {
        mockApiFetchImplementation();
        render(<ReportsPage />);

        expect(await screen.findByText('Clinician Communication Study Report')).toBeInTheDocument();
        expect(screen.getByText('Health Education Initiative Report')).toBeInTheDocument();
    });

    it('shows "No reports found." when the reports list is empty', async () => {
        mockApiFetchImplementation({ reports: [] });
        render(<ReportsPage />);

        expect(await screen.findByText('No reports found.')).toBeInTheDocument();
    });

    it('shows an error message when fetching reports fails', async () => {
        (apiFetch as jest.Mock).mockImplementation((endpoint: string) => {
            if (endpoint === '/reports') {
                return Promise.reject(new Error('Failed to load reports'));
            }
            return Promise.resolve(mockProjects);
        });
        render(<ReportsPage />);

        expect(await screen.findByText('Failed to load reports')).toBeInTheDocument();
    });

    it('derives the Format column from the object_url extension', async () => {
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        expect(screen.getByText('PDF')).toBeInTheDocument();
        expect(screen.getByText('Word')).toBeInTheDocument();
    });

    it('disables the Delete button until at least one row is selected', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        const deleteButton = screen.getByRole('button', { name: /delete/i });
        expect(deleteButton).toBeDisabled();

        const checkboxes = screen.getAllByRole('checkbox');
        // First checkbox in the header is "select all"; row checkboxes follow.
        await user.click(checkboxes[1]);

        expect(deleteButton).not.toBeDisabled();
    });

    it('selects all rows on the current page when the header checkbox is checked', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        const checkboxes = screen.getAllByRole('checkbox');
        const headerCheckbox = checkboxes[0];
        await user.click(headerCheckbox);

        const deleteButton = screen.getByRole('button', { name: /delete/i });
        expect(deleteButton).not.toBeDisabled();
    });

    it('opens the Generate New Report modal when Generate is clicked', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        await user.click(screen.getByRole('button', { name: /^generate$/i }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Generate New Report')).toBeInTheDocument();
        expect(within(dialog).getByText('Project')).toBeInTheDocument();
        expect(within(dialog).getByText('Format')).toBeInTheDocument();
    });

    it('closes the Generate modal when Cancel is clicked', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        await user.click(screen.getByRole('button', { name: /^generate$/i }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Generate New Report')).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    it('calls POST /reports/generate with the selected project and file type', async () => {
        const user = userEvent.setup();
        (apiFetch as jest.Mock).mockImplementation((endpoint: string) => {
            if (endpoint === '/reports') return Promise.resolve({ data: mockReports });
            if (endpoint === '/projects') return Promise.resolve(mockProjects);
            if (endpoint === '/reports/generate') return Promise.resolve({ ok: true });
            return Promise.resolve({});
        });

        render(<ReportsPage />);
        await screen.findByText('Clinician Communication Study Report');

        await user.click(screen.getByRole('button', { name: /^generate$/i }));
        const dialog = await screen.findByRole('dialog');

        await user.click(within(dialog).getByRole('button', { name: /^generate$/i }));

        await waitFor(() => {
            expect(apiFetch).toHaveBeenCalledWith(
                '/reports/generate',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ project_id: 1, file_type: 'pdf' }),
                }),
            );
        });
    });

    it('opens the Upload New Report modal when New Report is clicked', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        await user.click(screen.getByRole('button', { name: /new report/i }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Upload New Report')).toBeInTheDocument();
    });

    it('switches to the Schedule tab and shows the not-implemented message', async () => {
        const user = userEvent.setup();
        mockApiFetchImplementation();
        render(<ReportsPage />);

        await screen.findByText('Clinician Communication Study Report');

        await user.click(screen.getByRole('button', { name: /schedule/i }));

        expect(await screen.findByText('Schedule view not yet implemented.')).toBeInTheDocument();
        expect(screen.queryByText('Clinician Communication Study Report')).not.toBeInTheDocument();
    });
});