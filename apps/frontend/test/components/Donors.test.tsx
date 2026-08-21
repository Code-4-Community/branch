import { render, screen, fireEvent, waitFor } from '../utils';
import Donors from '@/app/donors/page';

describe('Donors Page', () => {
    beforeEach(() => {
        localStorage.setItem('branch_access_token', 'fake.access.token');
        localStorage.setItem('branch_id_token', 'fake.id.token');
        localStorage.setItem('branch_refresh_token', 'fake.refresh');

        global.fetch = jest.fn().mockImplementation((input: RequestInfo) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            if (url.includes('/auth/me')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ userId: 1, cognitoSub: 'sub-test', email: 'test@example.com', name: 'Test User', isAdmin: false }) } as unknown as Response);
            }
            if (url.includes('/donors')) {
                return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ donor_id: 1, organization: 'Org A', contact_name: null, contact_email: null }] }) } as unknown as Response);
            }
            return Promise.resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        localStorage.clear();
    });

    it('renders the Donors heading', () => {
        render(<Donors />);
        expect(screen.getByText('Donors', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the search input', () => {
        render(<Donors />);
        expect(screen.getByPlaceholderText('🔍︎ Search...')).toBeInTheDocument();
    });

    it('renders Filter By, Sort By, and New Donor buttons', () => {
        render(<Donors />);
        expect(screen.getByText('Filter By')).toBeInTheDocument();
        expect(screen.getByText('Sort By')).toBeInTheDocument();
        expect(screen.getByText('New Donor')).toBeInTheDocument();
    });

    it('renders the table with correct headers', async () => {
        render(<Donors />);
        expect(await screen.findByText('Donor ID')).toBeInTheDocument();
        expect(await screen.findByText('Donor Name')).toBeInTheDocument();
        expect(await screen.findByText('Contact Name')).toBeInTheDocument();
        expect(await screen.findByText('Contact Email')).toBeInTheDocument();
    });

    it('renders left and right pagination arrows', () => {
        render(<Donors />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('shows filter dropdown when Filter By is clicked', () => {
        render(<Donors />);
        fireEvent.click(screen.getByText('Filter By'));
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows sort dropdown when Sort By is clicked', () => {
        render(<Donors />);
        fireEvent.click(screen.getByText('Sort By'));
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows new donor modal when New Donor is clicked', async () => {
        render(<Donors />);
        fireEvent.click(screen.getByText('New Donor'));
        await waitFor(() => {
            expect(screen.getByText('Add New Donor')).toBeInTheDocument();
        });
    });
})