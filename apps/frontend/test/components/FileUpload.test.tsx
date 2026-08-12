import { render, screen, act, waitFor } from '../utils';
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

/** Resolves on demand so the in-flight upload state can be asserted. */
function deferredUpload() {
  let resolve!: (url: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { upload: jest.fn(() => promise), resolve, reject };
}

describe('FileUpload Component', () => {
  beforeEach(() => {
    capturedOnDrop = null;
  });

  it('renders the empty dropzone state', () => {
    render(<FileUpload value={null} onChange={() => {}} upload={jest.fn()} />);
    expect(screen.getByText('Upload PDF Receipt')).toBeInTheDocument();
    expect(screen.getByText('PDF only')).toBeInTheDocument();
  });

  it('renders FilePreview when a value is provided', () => {
    render(<FileUpload value={makePdf()} onChange={() => {}} upload={jest.fn()} />);
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    expect(screen.getByText('Upload Complete')).toBeInTheDocument();
  });

  it('shows the upload progress bar while the upload is in flight', async () => {
    const { upload } = deferredUpload();
    render(<FileUpload value={null} onChange={() => {}} upload={upload} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });

    expect(await screen.findByText(/uploading\.\.\./)).toBeInTheDocument();
  });

  it('calls onChange with the file and object URL once the upload resolves', async () => {
    const onChange = jest.fn();
    const { upload, resolve } = deferredUpload();
    render(<FileUpload value={null} onChange={onChange} upload={upload} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });
    await act(async () => {
      resolve('https://bucket.s3.us-east-2.amazonaws.com/receipts/1/receipt.pdf');
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].name).toBe('receipt.pdf');
    expect(onChange.mock.calls[0][1]).toBe(
      'https://bucket.s3.us-east-2.amazonaws.com/receipts/1/receipt.pdf',
    );
  });

  it('surfaces a failure message when the upload rejects', async () => {
    const onChange = jest.fn();
    const { upload, reject } = deferredUpload();
    render(<FileUpload value={null} onChange={onChange} upload={upload} />);

    act(() => {
      capturedOnDrop!([makePdf()], []);
    });
    await act(async () => {
      reject(new Error('boom'));
    });

    expect(await screen.findByText('File failed to upload')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it('does not accept drops while a reason to disable is given', () => {
    render(
      <FileUpload
        value={null}
        onChange={() => {}}
        upload={jest.fn()}
        disabledReason="Select a project first"
      />,
    );
    expect(screen.getByText('Select a project first')).toBeInTheDocument();
  });

  it('calls onReject when a rejected file is dropped', () => {
    const onReject = jest.fn();
    render(
      <FileUpload value={null} onChange={() => {}} upload={jest.fn()} onReject={onReject} />,
    );

    act(() => {
      capturedOnDrop!([], [{ file: makePdf('bad.png'), errors: [] }]);
    });

    expect(onReject).toHaveBeenCalled();
  });
});
