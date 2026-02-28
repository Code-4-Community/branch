import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom'; // Add this line to fix the error
import Header from './Header';

describe('Header Component', () => {
  it('renders the default title when no props are provided', () => {
    render(<Header />);
    expect(screen.getByText(/BRANCH Accounting Platform/i)).toBeInTheDocument();
  });
});

it('renders a custom title when the text prop is provided', () => {
    render(<Header text="Custom Title" />);
    expect(screen.getByText(/Custom Title/i)).toBeInTheDocument();
  });

  it('renders a custom icon when the icon prop is provided', () => {
    render(<Header icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
