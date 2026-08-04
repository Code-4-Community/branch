import { render, screen, act } from '../utils';
import FileUpload from '@/app/components/FileUpload';

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
});

// Capture the onDrop passed to useDropzone so we can invoke it manually
let capturedOnDrop: ((accepted: File[], rejections: unknown[]) => void) | null = null;

jest.mock('react-dropzone', () => ({
  useDropzone: (config: { onDrop: (a: File[], r: unknown[]) => void }) => {
    capturedOnDrop = config.onDrop;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({ 'data-testid': 'file-input' }),
      isDragActive: false,
      open: jest.fn(),
    };
  },
}));

function makePdf(name = 'receipt.pdf') {
  return new File(['dummy-content'], name, { type: 'application/pdf' });
}

describe('FileUpload Component', () => {
  beforeEach(() => {
    capturedOnDrop = null;
  });

  it('renders the empty dropzone state', () => {
    render(<FileUpload value={null} onChange={() => {}} />);
    expect(screen.getByText('Upload PDF Receipt')).toBeInTheDocument();
    expect(screen.getByText('PDF only')).toBeInTheDocument();
  });

  it('renders FilePreview when a value is provided', () => {
    render(<FileUpload value={makePdf()} onChange={() => {}} />);
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    expect(screen.getByText('Upload Complete')).toBeInTheDocument();
  });

  it('calls onChange as soon as a valid file is dropped', () => {
    const onChange = jest.fn();
    render(<FileUpload value={null} onChange={onChange} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });

    expect(onChange.mock.calls[0][0].name).toBe('receipt.pdf');
  });

  it('shows no progress bar on drop — the upload happens on submit', () => {
    render(<FileUpload value={null} onChange={() => {}} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });

    expect(screen.queryByText(/uploading\.\.\./)).not.toBeInTheDocument();
  });

  it('renders the real transferred bytes when the parent reports progress', () => {
    render(
      <FileUpload
        value={makePdf()}
        onChange={() => {}}
        progress={{ transferredBytes: 512, totalBytes: 2048, fileName: 'receipt.pdf' }}
      />,
    );

    expect(screen.getByText(/receipt\.pdf uploading\.\.\./)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('returns to the preview once progress clears', () => {
    const { rerender } = render(
      <FileUpload
        value={makePdf()}
        onChange={() => {}}
        progress={{ transferredBytes: 2048, totalBytes: 2048, fileName: 'receipt.pdf' }}
      />,
    );
    expect(screen.getByText('100%')).toBeInTheDocument();

    rerender(<FileUpload value={makePdf()} onChange={() => {}} progress={null} />);
    expect(screen.getByText('Upload Complete')).toBeInTheDocument();
  });

  it('calls onReject when a rejected file is dropped', () => {
    const onReject = jest.fn();
    render(<FileUpload value={null} onChange={() => {}} onReject={onReject} />);

    act(() => {
      capturedOnDrop!([], [{ file: makePdf('bad.png'), errors: [] }]);
    });

    expect(onReject).toHaveBeenCalled();
  });
});