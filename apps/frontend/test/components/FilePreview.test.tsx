import { render, screen, fireEvent } from '../utils';
import FilePreview from '@/app/components/FilePreview';

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
});

function makeFile(name = 'receipt.pdf') {
  return new File(['dummy'], name, { type: 'application/pdf' });
}

describe('FilePreview Component', () => {
  it('renders the file name', () => {
    render(<FilePreview file={makeFile()} onRemove={() => {}} onReplace={() => {}} />);
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
  });

  it('renders view pdf and download links', () => {
    render(<FilePreview file={makeFile()} onRemove={() => {}} onReplace={() => {}} />);
    expect(screen.getByText('view pdf')).toBeInTheDocument();
    expect(screen.getByText('download')).toBeInTheDocument();
  });

  it('renders the Upload Complete row', () => {
    render(<FilePreview file={makeFile()} onRemove={() => {}} onReplace={() => {}} />);
    expect(screen.getByText('Upload Complete')).toBeInTheDocument();
  });

  it('renders the Select a File button', () => {
    render(<FilePreview file={makeFile()} onRemove={() => {}} onReplace={() => {}} />);
    expect(screen.getByText('Select a File')).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = jest.fn();
    render(<FilePreview file={makeFile()} onRemove={onRemove} onReplace={() => {}} />);
    fireEvent.click(screen.getByLabelText('Remove file'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onReplace when Select a File is clicked', () => {
    const onReplace = jest.fn();
    render(<FilePreview file={makeFile()} onRemove={() => {}} onReplace={onReplace} />);
    fireEvent.click(screen.getByText('Select a File'));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('sets download attribute to the file name', () => {
    render(<FilePreview file={makeFile('ferry.pdf')} onRemove={() => {}} onReplace={() => {}} />);
    expect(screen.getByText('download')).toHaveAttribute('download', 'ferry.pdf');
  });
});