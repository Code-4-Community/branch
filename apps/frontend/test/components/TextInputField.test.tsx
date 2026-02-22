import { render, screen } from '../utils';
import userEvent from '@testing-library/user-event';
import TextInputField from '@/app/components/TextInputField';

describe('TextInputField', () => {
  it('renders the label', () => {
    render(<TextInputField label="Name*" />);
    expect(screen.getByText('Name*')).toBeInTheDocument();
  });

  it('renders with a placeholder', () => {
    render(<TextInputField label="Name*" placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('accepts typed input in uncontrolled mode', async () => {
    const user = userEvent.setup();
    render(<TextInputField label="Name*" />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Hello');
    expect(input).toHaveValue('Hello');
  });

  it('calls onChange with the current value on each keystroke', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TextInputField label="Name*" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'Hi');
    expect(onChange).toHaveBeenCalledWith('H');
    expect(onChange).toHaveBeenCalledWith('Hi');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('displays a controlled value', () => {
    render(<TextInputField label="Name*" value="Controlled" />);
    expect(screen.getByRole('textbox')).toHaveValue('Controlled');
  });

  it('does not call internal state update when controlled', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TextInputField label="Name*" value="Fixed" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'x');
    // value stays "Fixed" because the parent controls it
    expect(screen.getByRole('textbox')).toHaveValue('Fixed');
    expect(onChange).toHaveBeenCalledWith('Fixedx');
  });

  it('shows error message when isError and errorMessage are set', () => {
    render(<TextInputField label="Name*" isError errorMessage="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('does not show error message when isError is false', () => {
    render(<TextInputField label="Name*" errorMessage="should not appear" />);
    expect(screen.queryByText('should not appear')).not.toBeInTheDocument();
  });

  it('does not show error message when errorMessage is omitted', () => {
    const { container } = render(<TextInputField label="Name*" isError />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });
});
