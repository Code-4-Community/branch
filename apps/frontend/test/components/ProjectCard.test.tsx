import { render, screen } from '../utils';
import ProjectCard from '@/app/components/ProjectCard';

const activeMockProps = {
    variant: 'active' as const,
    name: 'Clinician Communication Study',
    total_budget: 500000,
    budget_used: 150000,
    members: 3,
};

const archiveMockProps = {
    variant: 'archive' as const,
    name: 'Health Education Initiative',
    total_budget: 300000,
    members: 2,
    start_date: 'Jan 1, 2025',
    end_date: 'Mar 1, 2026',
};

describe('ProjectCard (active)', () => {
    it('renders the project name', () => {
        render(<ProjectCard {...activeMockProps} />);
        expect(screen.getByText('Clinician Communication Study')).toBeInTheDocument();
    });

    it('renders the budget label and values', () => {
        render(<ProjectCard {...activeMockProps} />);
        expect(screen.getByText('Budget')).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes('150,000') && content.includes('500,000'))).toBeInTheDocument();
    });

    it('renders the staff label and member count', () => {
        render(<ProjectCard {...activeMockProps} />);
        expect(screen.getByText('Staff')).toBeInTheDocument();
        expect(screen.getByText('3 members')).toBeInTheDocument();
    });

    it('renders the correct percentage', () => {
        render(<ProjectCard {...activeMockProps} />);
        const percentage = Math.round((activeMockProps.budget_used / activeMockProps.total_budget) * 100);
        expect(screen.getByText(`${percentage}%`)).toBeInTheDocument();
    });

    it('renders 0% rather than NaN when the project has no budget', () => {
        render(<ProjectCard {...activeMockProps} total_budget={0} budget_used={0} />);
        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('renders 0% rather than Infinity when spend exists but no budget is set', () => {
        render(<ProjectCard {...activeMockProps} total_budget={0} budget_used={4500} />);
        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('reports overspend honestly but keeps the bar within the track', () => {
        const { container } = render(
            <ProjectCard {...activeMockProps} total_budget={1000} budget_used={2000} />,
        );
        expect(screen.getByText('200%')).toBeInTheDocument();
        const bar = container.querySelector('.bg-core-green') as HTMLElement;
        expect(bar.style.width).toBe('100%');
    });
});

describe('ProjectCard (archive)', () => {
    it('renders the project name', () => {
        render(<ProjectCard {...archiveMockProps} />);
        expect(screen.getByText('Health Education Initiative')).toBeInTheDocument();
    });

    it('renders the budget label and total', () => {
        render(<ProjectCard {...archiveMockProps} />);
        expect(screen.getByText('Budget')).toBeInTheDocument();
        expect(screen.getByText('$300,000')).toBeInTheDocument();
    });

    it('renders the staff label and member count', () => {
        render(<ProjectCard {...archiveMockProps} />);
        expect(screen.getByText('Staff')).toBeInTheDocument();
        expect(screen.getByText('2 members')).toBeInTheDocument();
    });

    it('renders the start and end date labels', () => {
        render(<ProjectCard {...archiveMockProps} />);
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
    });

    it('renders the correct start and end date values', () => {
        render(<ProjectCard {...archiveMockProps} />);
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
        expect(screen.getByText('Mar 1, 2026')).toBeInTheDocument();
    });
});