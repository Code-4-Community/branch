import { render, screen, fireEvent, waitFor, signIn, signOut } from '../utils';
import Donors from '@/app/donors/page';

describe('Donors Page', () => {
    beforeEach(() => {
        signIn();
    });
    afterEach(() => {
        signOut();
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
        expect(await screen.findByText('# of Projects')).toBeInTheDocument();
        expect(await screen.findByText('Last Donation')).toBeInTheDocument();
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