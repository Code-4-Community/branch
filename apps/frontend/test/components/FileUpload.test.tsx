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

  it('shows the upload progress bar after a valid file is dropped', () => {
    jest.useFakeTimers();
    render(<FileUpload value={null} onChange={() => {}} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });

    expect(screen.getByText(/uploading\.\.\./)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('calls onChange with the file once the simulated upload completes', () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    render(<FileUpload value={null} onChange={onChange} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onChange.mock.calls[0][0].name).toBe('receipt.pdf');
    jest.useRealTimers();
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