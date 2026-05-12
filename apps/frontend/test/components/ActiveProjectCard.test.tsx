import { render, screen } from '../utils';
import ProjectCard from '@/app/components/ActiveProjectCard';

const mockProps = {
    name: 'Clinician Communication Study',
    total_budget: 500000,
    budget_used: 150000,
    members: 3,
};

describe('ProjectCard', () => {
    it('renders the project name', () => {
        render(<ProjectCard {...mockProps} />);
        expect(screen.getByText('Clinician Communication Study')).toBeInTheDocument();
    });

    it('renders the budget label and values', () => {
        render(<ProjectCard {...mockProps} />);
        expect(screen.getByText('Budget')).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('150,000') && content.includes('500,000'))).toBeInTheDocument();
    });

    it('renders the staff label and member count', () => {
        render(<ProjectCard {...mockProps} />);
        expect(screen.getByText('Staff')).toBeInTheDocument();
        expect(screen.getByText('3 members')).toBeInTheDocument();
    });

    it('renders the correct percentage', () => {
        render(<ProjectCard {...mockProps} />);
        const percentage = Math.round((mockProps.budget_used / mockProps.total_budget) * 100);
        expect(screen.getByText(`${percentage}%`)).toBeInTheDocument();
    });
});