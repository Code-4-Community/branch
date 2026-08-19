import { render, screen } from '../utils';
import LoadingState from '@/app/components/LoadingState';
import Spinner from '@/app/components/Spinner';

describe('LoadingState', () => {
  it('names the region for screen readers without showing the text', () => {
    render(<LoadingState label="Loading projects…" />);

    expect(screen.getByRole('status', { name: 'Loading projects…' })).toBeInTheDocument();
    expect(screen.queryByText('Loading projects…')).not.toBeInTheDocument();
  });

  it('can show the label as text', () => {
    render(<LoadingState label="Loading projects…" showLabel />);

    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects…');
  });
});

describe('Spinner', () => {
  it('is decorative unless it is given a label', () => {
    const { container } = render(<Spinner />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('.branch-spinner')).toBeInTheDocument();
  });

  it('announces itself when it is the only loading cue', () => {
    render(<Spinner label="Saving…" />);

    expect(screen.getByRole('status', { name: 'Saving…' })).toBeInTheDocument();
  });
});
