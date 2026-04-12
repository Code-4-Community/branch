import { render, screen, fireEvent } from '../utils';
import StaffCard from '@/app/components/StaffCard';

describe ('StaffCard', () => {
    it('renders the placeholder image when no image given', () => {
        render(<StaffCard name="name" title="title" />);
        expect(document.querySelector('.bg-accent-dark-green')).toBeInTheDocument();
    });

    it('renders the placeholder image when image given image has error', () => {
        render(<StaffCard image="/" name="name" title="title" />);
        const img = document.querySelector('img');
        fireEvent.error(img!);
        expect(document.querySelector('.bg-accent-dark-green')).toBeInTheDocument();
    });

    it('renders the given image', () => {
        render(<StaffCard image="/test.jpg" name="name" title="title" />);
        const img = document.querySelector('img');
        expect(img).toHaveAttribute('src', expect.stringContaining('test.jpg'));
    });

    it('renders the name', () => {
        render(<StaffCard name="name" title="title" />);
        expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('renders the title', () => {
        render(<StaffCard name="name" title="title" />);
        expect(screen.getByText('title')).toBeInTheDocument();
    });

    it('long name and title are wrapped', () => {
        render(<StaffCard name="superduper longname" title="superduper longtitle" />);
        const name = screen.getByText('superduper longname');
        const title = screen.getByText('superduper longtitle');
        expect(name).toHaveClass('break-words');
        expect(title).toHaveClass('break-words');    });
})