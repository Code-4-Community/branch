import { fireEvent, render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import UpdatePhotoModal from '@/app/components/UpdatePhotoModal';

const mockGetPhotoUploadUrl = jest.fn();
const mockUploadPhotoToS3 = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../../src/lib/users', () => ({
  ...jest.requireActual('../../src/lib/users'),
  getPhotoUploadUrl: (...args: unknown[]) => mockGetPhotoUploadUrl(...args),
  uploadPhotoToS3: (...args: unknown[]) => mockUploadPhotoToS3(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  usePathname: jest.fn(() => '/profile'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

function pngFile(name = 'avatar.png') {
  return new File(['bytes'], name, { type: 'image/png' });
}

function renderModal(overrides: Partial<Parameters<typeof UpdatePhotoModal>[0]> = {}) {
  const onUpdated = jest.fn();
  const onClose = jest.fn();
  render(
    <UpdatePhotoModal
      open
      currentPhoto={null}
      name="Ada Lovelace"
      userId={7}
      onClose={onClose}
      onUpdated={onUpdated}
      {...overrides}
    />,
  );
  return { onUpdated, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom has no object-URL implementation.
  global.URL.createObjectURL = jest.fn(() => 'blob:preview');
  global.URL.revokeObjectURL = jest.fn();
});

describe('UpdatePhotoModal', () => {
  it('starts with no file selected and Update disabled', () => {
    renderModal();

    expect(screen.getByText('(No file selected)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
  });

  it('shows the chosen file name and enables Update', async () => {
    renderModal();

    await userEvent.upload(screen.getByLabelText('Choose a photo to upload'), pngFile());

    expect(await screen.findByText('avatar.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('rejects an unsupported file type without uploading', async () => {
    renderModal();

    // fireEvent, not userEvent.upload: the input's `accept` filter would make
    // userEvent drop the file before the component ever sees it, so the
    // client-side guard would go untested.
    const input = screen.getByLabelText('Choose a photo to upload') as HTMLInputElement;
    const rejected = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [rejected] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('File type not supported');
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    expect(mockGetPhotoUploadUrl).not.toHaveBeenCalled();
  });

  it('uploads to the presigned URL, stores the key, and reports completion', async () => {
    mockGetPhotoUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example/put',
      key: 'avatars/7/1700000000000.png',
      contentType: 'image/png',
    });
    mockUploadPhotoToS3.mockResolvedValue(undefined);
    mockUpdateUser.mockResolvedValue({
      userId: 7,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      isAdmin: false,
      profile_image: 'https://s3.example/signed-get',
    });

    const { onUpdated } = renderModal();

    await userEvent.upload(screen.getByLabelText('Choose a photo to upload'), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Upload Complete')).toBeInTheDocument();
    expect(mockGetPhotoUploadUrl).toHaveBeenCalledWith(7, 'avatar.png');
    expect(mockUploadPhotoToS3).toHaveBeenCalledWith(
      'https://s3.example/put',
      expect.any(File),
      'image/png',
      expect.any(Function),
    );
    // The stored value is the key, not the presigned URL, which expires.
    expect(mockUpdateUser).toHaveBeenCalledWith(7, {
      profileImage: 'avatars/7/1700000000000.png',
    });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith('https://s3.example/signed-get'));
  });

  it('surfaces a failed upload and allows a retry', async () => {
    mockGetPhotoUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example/put',
      key: 'avatars/7/1.png',
      contentType: 'image/png',
    });
    mockUploadPhotoToS3.mockRejectedValue(new Error('File failed to upload'));

    renderModal();

    await userEvent.upload(screen.getByLabelText('Choose a photo to upload'), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('File failed to upload');
    expect(mockUpdateUser).not.toHaveBeenCalled();
    // Back to idle rather than stuck on the spinner.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
