import { render, screen, fireEvent } from '../utils';
import StaffCard from '@/app/components/StaffCard';

describe ('StaffCard', () => {
    it('renders the placeholder image when no image given', () => {
        render(<StaffCard name="name" />);
        expect(document.querySelector('[data-testid="staff-placeholder"]')).toBeInTheDocument();
    });

    it('renders the placeholder image when image given image has error', () => {
        render(<StaffCard image="/" name="name" />);
        const img = document.querySelector('img');
        fireEvent.error(img!);
        expect(document.querySelector('[data-testid="staff-placeholder"]')).toBeInTheDocument();
    });

    it('renders the given image', () => {
        render(<StaffCard image="/test.jpg" name="name" />);
        const img = document.querySelector('img');
        expect(img).toHaveAttribute('src', expect.stringContaining('test.jpg'));
    });

    it('renders the name', () => {
        render(<StaffCard name="name" />);
        expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('long name is wrapped', () => {
        render(<StaffCard name="superduper longname" />);
        const name = screen.getByText('superduper longname');
        expect(name).toHaveClass('break-words');    
    });
})