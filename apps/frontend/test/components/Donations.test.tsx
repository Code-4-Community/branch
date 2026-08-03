import { render, screen, fireEvent, waitFor } from '../utils';
import Donations from '@/app/donations/page';

describe('Donations Page Component', () => {
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