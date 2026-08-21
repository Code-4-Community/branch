import { render, screen, fireEvent, waitFor } from '../utils';
import Donations from '@/app/donations/page';

describe('Donations Page Component', () => {
    beforeEach(() => {
        // seed tokens expected by the app
        localStorage.setItem('branch_access_token', 'fake.access.token');
        localStorage.setItem('branch_id_token', 'fake.id.token');
        localStorage.setItem('branch_refresh_token', 'fake.refresh');

        global.fetch = jest.fn().mockImplementation((input: RequestInfo) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            if (url.includes('/auth/me')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ userId: 1, cognitoSub: 'sub-test', email: 'test@example.com', name: 'Test User', isAdmin: false }) } as unknown as Response);
            }
            if (url.includes('/donations')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ donation_id: 1, donor_id: 1, project_id: 1, donated_at: '2026-01-01', amount: 100 }] }) } as unknown as Response);
            }
            if (url.includes('/donors')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ donor_id: 1, organization: 'Org A' }] }) } as unknown as Response);
            }
            if (url.includes('/projects')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ([{ project_id: 1, name: 'Proj Alpha' }]) } as unknown as Response);
            }
            return Promise.resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        localStorage.clear();
    });

    it('renders the donations heading', () => {
        render(<Donations />);
        expect(screen.getByText('Donations', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the search input', () => {
        render(<Donations />);
        expect(screen.getByPlaceholderText('🔍︎ Search...')).toBeInTheDocument();
    });

    it('renders Filter By Donor, Sort By, and New Donation buttons', () => {
        render(<Donations />);
        expect(screen.getByText('Filter By Donor')).toBeInTheDocument();
        expect(screen.getByText('Sort By')).toBeInTheDocument();
        expect(screen.getByText('New Donation')).toBeInTheDocument();
    });

    it('renders the table with correct headers', async () => {
        render(<Donations />);
        expect(await screen.findByText('Date')).toBeInTheDocument();
        expect(await screen.findByText('Donor ID')).toBeInTheDocument();
        expect(await screen.findByText('Project Name')).toBeInTheDocument();
        expect(await screen.findByText('Amount')).toBeInTheDocument();
    });

    it('renders left and right pagination arrows', () => {
        render(<Donations />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('shows filter dropdown when Filter By Donor is clicked', () => {
        render(<Donations />);
        fireEvent.click(screen.getByText('Filter By Donor'));
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows sort dropdown when Sort By is clicked', () => {
        render(<Donations />);
        fireEvent.click(screen.getByText('Sort By'));
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows new donation modal when New Donation is clicked', async () => {
        render(<Donations />);
        fireEvent.click(screen.getByText('New Donation'));
        await waitFor(() => {
            expect(screen.getByText('Add New Donation')).toBeInTheDocument();
        });
    });

    it('renders date input in the new donation modal', async () => {
        render(<Donations />);
        fireEvent.click(screen.getByText('New Donation'));
        await waitFor(() => {
            expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
        });
    });
});