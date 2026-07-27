import { render, screen, fireEvent, waitFor } from '../utils';
import UploadReportModal from '@/app/components/UploadReportModal';
import * as reportsLib from '@/lib/reports';

jest.mock('../../src/lib/reports', () => ({
  uploadReport: jest.fn(),
}));

jest.mock('../../src/app/components/DropdownSelector', () => {
  return function MockDropdownSelector({
    options,
    placeholder,
    value,
    onChange,
  }: {
    options: string[];
    placeholder?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) {
    return (
      <select
        aria-label={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled>-- {placeholder} --</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  };
});

const mockProjects = [
  { project_id: 1, name: 'Clinician Communication Study' },
  { project_id: 2, name: 'Health Education Initiative' },
];

const baseProps = {
  open: true,
  onClose: jest.fn(),
  onSuccess: jest.fn(),
  token: 'test-token',
  projects: mockProjects,
};

function selectFile(name = 'report.pdf', type = 'application/pdf') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['content'], name, { type });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UploadReportModal', () => {
  it('renders the modal title when open', () => {
    render(<UploadReportModal {...baseProps} />);
    expect(screen.getByText('Upload New Report')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<UploadReportModal {...baseProps} open={false} />);
    expect(screen.queryByText('Upload New Report')).not.toBeInTheDocument();
  });

  it('renders all field labels and action buttons', () => {
    render(<UploadReportModal {...baseProps} />);
    expect(screen.getByText('File* (PDF or DOCX)')).toBeInTheDocument();
    expect(screen.getByText('Title*')).toBeInTheDocument();
    expect(screen.getByText('Project*')).toBeInTheDocument();
    expect(screen.getByText('Report Type*')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', () => {
    render(<UploadReportModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    expect(screen.getByText('Select a PDF or DOCX file')).toBeInTheDocument();
    expect(screen.getByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Select a project')).toBeInTheDocument();
    expect(screen.getByText('Select a report type')).toBeInTheDocument();
  });

  it('does not call uploadReport when the form is invalid', () => {
    render(<UploadReportModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(reportsLib.uploadReport).not.toHaveBeenCalled();
  });

  it('rejects unsupported file types', () => {
    render(<UploadReportModal {...baseProps} />);
    selectFile('image.png', 'image/png');
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(screen.getByText('Select a PDF or DOCX file')).toBeInTheDocument();
  });

  it('calls uploadReport with the correct args when the form is valid', async () => {
    (reportsLib.uploadReport as jest.Mock).mockResolvedValueOnce({});
    render(<UploadReportModal {...baseProps} />);

    selectFile('report.pdf', 'application/pdf');
    fireEvent.change(screen.getByPlaceholderText('Enter report title'), {
      target: { value: 'Q1 Report' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Clinician Communication Study' },
    });
    fireEvent.change(screen.getByLabelText('Select a report type'), {
      target: { value: 'Technical' },
    });

    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => {
      expect(reportsLib.uploadReport).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'report.pdf' }),
        'Q1 Report',
        1,
        'technical',
        'test-token',
      );
    });
  });

  it('calls onSuccess after a successful upload', async () => {
    (reportsLib.uploadReport as jest.Mock).mockResolvedValueOnce({});
    render(<UploadReportModal {...baseProps} />);

    selectFile();
    fireEvent.change(screen.getByPlaceholderText('Enter report title'), {
      target: { value: 'Q1 Report' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Health Education Initiative' },
    });
    fireEvent.change(screen.getByLabelText('Select a report type'), {
      target: { value: 'Narrative' },
    });

    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a submit error if uploadReport rejects', async () => {
    (reportsLib.uploadReport as jest.Mock).mockRejectedValueOnce(new Error('S3 upload failed'));
    render(<UploadReportModal {...baseProps} />);

    selectFile();
    fireEvent.change(screen.getByPlaceholderText('Enter report title'), {
      target: { value: 'Q1 Report' },
    });
    fireEvent.change(screen.getByLabelText('Select a project'), {
      target: { value: 'Clinician Communication Study' },
    });
    fireEvent.change(screen.getByLabelText('Select a report type'), {
      target: { value: 'Technical' },
    });

    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText('S3 upload failed')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<UploadReportModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});
