import { render, screen, fireEvent } from '../utils';
import StaffCard from '@/app/components/StaffCard';

describe('StaffCard', () => {
    it('renders the placeholder image when no image given', () => {
        render(<StaffCard name="name" email="test@gmail.com" />);
        expect(document.querySelector('[data-testid="staff-placeholder"]')).toBeInTheDocument();
    });

    it('renders the placeholder image when given image has error', () => {
        render(<StaffCard image="/" name="name" email="test@gmail.com" />);
        const img = document.querySelector('img');
        fireEvent.error(img!);
        expect(document.querySelector('[data-testid="staff-placeholder"]')).toBeInTheDocument();
    });

    it('renders the given image', () => {
        render(<StaffCard image="/test.jpg" name="name" email="test@gmail.com" />);
        const img = document.querySelector('img');
        expect(img).toHaveAttribute('src', expect.stringContaining('test.jpg'));
    });

    it('renders the name', () => {
        render(<StaffCard name="name" email="test@gmail.com" />);
        expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('renders the name with title appended', () => {
        render(<StaffCard name="Allen F. Shaughnessy" title="PharmD" email="test@gmail.com" />);
        expect(screen.getByText('Allen F. Shaughnessy, PharmD')).toBeInTheDocument();
    });

    it('renders the name without title when title not given', () => {
        render(<StaffCard name="name" email="test@gmail.com" />);
        expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('long name is wrapped', () => {
        render(<StaffCard name="superduper longname" email="test@gmail.com" />);
        const name = screen.getByText('superduper longname');
        expect(name).toHaveClass('break-words');
    });

    it('renders the email with a mailto compose link', () => {
        render(<StaffCard name="name" email="test@gmail.com" />);
        const link = screen.getByText('test@gmail.com');
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('test@gmail.com')));
    });
});