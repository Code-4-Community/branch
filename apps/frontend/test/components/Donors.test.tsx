import { render, screen, fireEvent, waitFor } from '../utils';
import Donors from '@/app/Donors';

describe('Login Page Component', () => {
    it('renders the login heading', () => {
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

    it('renders the table with correct headers', () => {
        render(<Donors />);
        expect(screen.getByText('Donor ID')).toBeInTheDocument();
        expect(screen.getByText('Donor Name')).toBeInTheDocument();
        expect(screen.getByText('# of Projects')).toBeInTheDocument();
        expect(screen.getByText('Last Donation')).toBeInTheDocument();
    });

    it('renders left and right pagination arrows', () => {
        render(<Donors />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('renders left and right pagination arrows', () => {
        render(<Donors />);
        const buttons = screen.getAllByRole('button');
        // arrows are icon elements, check left/right chevron icons are in the document
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