import { render, screen } from '../utils';
import UploadProgressBar from '@/app/components/UploadProgressBar';

describe('UploadProgressBar Component', () => {
  it('renders the filename with uploading text', () => {
    render(<UploadProgressBar transferredBytes={50} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('receipt.pdf uploading...')).toBeInTheDocument();
  });

  it('calculates and displays the correct percentage', () => {
    render(<UploadProgressBar transferredBytes={50} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('rounds the percentage', () => {
    render(<UploadProgressBar transferredBytes={1} totalBytes={3} fileName="receipt.pdf" />);
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('shows 0% when totalBytes is 0 (avoids divide by zero)', () => {
    render(<UploadProgressBar transferredBytes={0} totalBytes={0} fileName="receipt.pdf" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows 100% when fully transferred', () => {
    render(<UploadProgressBar transferredBytes={100} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});