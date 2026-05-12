import { render, screen } from '../utils';
import ArchiveProjectCard from '@/app/components/ArchiveProjectCard';

const mockProps = {
    name: 'Health Education Initiative',
    total_budget: 300000,
    members: 2,
    start_date: 'Jan 1, 2025',
    end_date: 'Mar 1, 2026',
};

describe('ArchiveProjectCard', () => {
    it('renders the project name', () => {
        render(<ArchiveProjectCard {...mockProps} />);
        expect(screen.getByText('Health Education Initiative')).toBeInTheDocument();
    });

    it('renders the budget label and total', () => {
        render(<ArchiveProjectCard {...mockProps} />);
        expect(screen.getByText('Budget')).toBeInTheDocument();
        expect(screen.getByText('$300,000')).toBeInTheDocument();
    });

    it('renders the staff label and member count', () => {
        render(<ArchiveProjectCard {...mockProps} />);
        expect(screen.getByText('Staff')).toBeInTheDocument();
        expect(screen.getByText('2 members')).toBeInTheDocument();
    });

    it('renders the start and end date labels', () => {
        render(<ArchiveProjectCard {...mockProps} />);
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
    });

    it('renders the correct start and end date values', () => {
        render(<ArchiveProjectCard {...mockProps} />);
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
        expect(screen.getByText('Mar 1, 2026')).toBeInTheDocument();
    });
});