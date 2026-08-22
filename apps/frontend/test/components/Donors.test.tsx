import { render, screen, fireEvent, waitFor } from '../utils';
import Donors from '@/app/donors/page';

describe('Donors Page', () => {
    it('renders the Donors heading', () => {
        render(<Donors />);
        expect(screen.getByText('Donors', { selector: 'h1' })).toBeInTheDocument();
    });

    it('renders the search input', () => {
        render(<Donors />);
        expect(screen.getByPlaceholderText('🔍︎ Search...')).toBeInTheDocument();
    });

    it('renders Last Donated and New Donor buttons', () => {
        render(<Donors />);
        expect(screen.getByText('Last Donated')).toBeInTheDocument();
        expect(screen.getByText('New Donor')).toBeInTheDocument();
    });

    it('renders the table with correct headers', () => {
        render(<Donors />);
        expect(screen.getByText('Donor ID')).toBeInTheDocument();
        expect(screen.getByText('Donor Name')).toBeInTheDocument();
        expect(screen.getByText('Contact Name')).toBeInTheDocument();
        expect(screen.getByText('Last Donation')).toBeInTheDocument();
    });

    it('renders left and right pagination arrows', () => {
        render(<Donors />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('toggles sort direction when Last Donated is clicked', () => {
        render(<Donors />);
        const sortButton = screen.getByText('Last Donated').closest('button')!;

        fireEvent.click(sortButton);
        expect(screen.getByText(/↓/)).toBeInTheDocument();

        fireEvent.click(sortButton);
        expect(screen.getByText(/↑/)).toBeInTheDocument();

        fireEvent.click(sortButton);
        expect(screen.queryByText(/↓|↑/)).not.toBeInTheDocument();
    });

    it('shows new donor modal when New Donor is clicked', async () => {
        render(<Donors />);
        fireEvent.click(screen.getByText('New Donor'));
        await waitFor(() => {
            expect(screen.getByText('Add New Donor')).toBeInTheDocument();
        });
    });
})