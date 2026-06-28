import { render, screen } from '../utils';
import UploadProgress from '@/app/components/UploadProgressBar';

describe('UploadProgress Component', () => {
  it('renders the filename with uploading text', () => {
    render(<UploadProgress transferredBytes={50} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('receipt.pdf uploading...')).toBeInTheDocument();
  });

  it('calculates and displays the correct percentage', () => {
    render(<UploadProgress transferredBytes={50} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('rounds the percentage', () => {
    render(<UploadProgress transferredBytes={1} totalBytes={3} fileName="receipt.pdf" />);
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('shows 0% when totalBytes is 0 (avoids divide by zero)', () => {
    render(<UploadProgress transferredBytes={0} totalBytes={0} fileName="receipt.pdf" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows 100% when fully transferred', () => {
    render(<UploadProgress transferredBytes={100} totalBytes={100} fileName="receipt.pdf" />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});