import { render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import DropdownSelector from '@/app/components/DropdownSelector';

const OPTIONS = ['Option A', 'Option B', 'Option C'];

describe('DropdownSelector', () => {
  it('renders with the default placeholder', () => {
    render(<DropdownSelector options={OPTIONS} />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('renders with a custom placeholder', () => {
    render(<DropdownSelector options={OPTIONS} placeholder="Choose one" />);
    expect(screen.getByText('Choose one')).toBeInTheDocument();
  });

  it('displays a controlled value in the trigger', () => {
    render(<DropdownSelector options={OPTIONS} value="Option B" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Option B');
  });

  it('opens the dropdown and shows all options on trigger click', async () => {
    const user = userEvent.setup();
    render(<DropdownSelector options={OPTIONS} />);
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      OPTIONS.forEach((option) => expect(screen.getByText(option)).toBeInTheDocument());
    });
  });

  it('calls onChange with the selected string value (single select)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<DropdownSelector options={OPTIONS} onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => screen.getByText('Option A'));
    await user.click(screen.getByText('Option A'));
    expect(onChange).toHaveBeenCalledWith('Option A');
  });

  it('closes the dropdown after a single-select choice', async () => {
    const user = userEvent.setup();
    render(<DropdownSelector options={OPTIONS} />);
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => screen.getByText('Option B'));
    await user.click(screen.getByText('Option B'));
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('multi-select', () => {
    it('calls onChange with an array of selected values', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(<DropdownSelector options={OPTIONS} multiSelect onChange={onChange} />);
      await user.click(screen.getByRole('combobox'));
      await waitFor(() => screen.getByText('Option A'));
      await user.click(screen.getByText('Option A'));
      expect(onChange).toHaveBeenCalledWith(['Option A']);
    });

    it('accumulates multiple selections', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(<DropdownSelector options={OPTIONS} multiSelect onChange={onChange} />);
      await user.click(screen.getByRole('combobox'));
      await waitFor(() => screen.getByText('Option A'));
      await user.click(screen.getByText('Option A'));
      await user.click(screen.getByText('Option C'));
      expect(onChange).toHaveBeenLastCalledWith(['Option A', 'Option C']);
    });

    it('deselects an already-selected option', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(
        <DropdownSelector options={OPTIONS} multiSelect value={['Option B']} onChange={onChange} />,
      );
      await user.click(screen.getByRole('combobox'));
      // Use role="option" to target the dropdown item, not the trigger text
      await waitFor(() => screen.getByRole('option', { name: 'Option B' }));
      await user.click(screen.getByRole('option', { name: 'Option B' }));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('keeps the dropdown open after a multi-select choice', async () => {
      const user = userEvent.setup();
      render(<DropdownSelector options={OPTIONS} multiSelect />);
      await user.click(screen.getByRole('combobox'));
      await waitFor(() => screen.getByText('Option A'));
      await user.click(screen.getByText('Option A'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });
});
