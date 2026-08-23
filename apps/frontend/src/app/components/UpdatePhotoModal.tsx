'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import { LuCircleCheck } from 'react-icons/lu';
import Button from './Button';
import ProfilePhoto from './ProfilePhoto';
import UploadProgressBar from './UploadProgressBar';
import {
  getPhotoUploadUrl,
  isSupportedPhoto,
  PHOTO_EXTENSIONS,
  updateUser,
  uploadPhotoToS3,
} from '@/lib/users';

/** The design tints the header and footer with Core Black/100 at 50%. */
const CHROME_BG =
  'color-mix(in srgb, var(--color-black-100) 50%, var(--color-core-white))';

interface UpdatePhotoModalProps {
  open: boolean;
  /** Presigned URL of the photo currently on the account, if any. */
  currentPhoto: string | null;
  name: string;
  userId?: number;
  onClose: () => void;
  /** Receives the presigned URL of the newly stored photo. */
  onUpdated: (profileImage: string) => void | Promise<void>;
}

type Phase = 'idle' | 'uploading' | 'done';

/**
 * Photo upload: presigned PUT straight to S3, then the returned key is PATCHed
 * onto the user. The bytes never pass through the lambda, which keeps a large
 * photo under the API Gateway payload limit.
 */
export default function UpdatePhotoModal({
  open,
  currentPhoto,
  name,
  userId,
  onClose,
  onUpdated,
}: UpdatePhotoModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transferred, setTransferred] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
    setPhase('idle');
    setTransferred(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Object URLs are leaked memory until revoked, and the preview is only ever
  // needed while its file is the staged one.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFileChosen(chosen: File | null) {
    if (!chosen) return;
    setError(null);
    setTransferred(0);
    setPhase('idle');

    if (!isSupportedPhoto(chosen)) {
      // Keep the rejected name visible: the message alone does not tell the
      // user which file was refused when they picked from a long list.
      setFile(chosen);
      setPreviewUrl(null);
      setError('File type not supported');
      return;
    }

    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  }

  async function handleUpload() {
    if (!file || !userId || error) return;
    setError(null);
    setTransferred(0);
    setPhase('uploading');

    try {
      const { uploadUrl, key, contentType } = await getPhotoUploadUrl(userId, file.name);
      await uploadPhotoToS3(uploadUrl, file, contentType, setTransferred);
      const updated = await updateUser(userId, { profileImage: key });
      setPhase('done');
      await onUpdated(updated.profile_image ?? '');
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'File failed to upload');
    }
  }

  const canUpload = !!file && !error && phase === 'idle';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* 409px is the Figma modal width; it shrinks with the viewport below that. */}
          <Dialog.Content width="100%" maxWidth="409px" marginX="4">
            <Dialog.Header
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              minHeight="64px"
              paddingX="24px"
              paddingY="0"
              backgroundColor={CHROME_BG}
            >
              <Dialog.Title
                fontFamily="var(--font-heading)"
                fontSize="var(--font-size-heading-3)"
                fontWeight={600}
              >
                Update Photo
              </Dialog.Title>
              <CloseButton onClick={onClose} aria-label="Close" />
            </Dialog.Header>

            <Dialog.Body paddingX="24px" paddingTop="30px" paddingBottom="24px">
              <div className="flex flex-col items-center !gap-4">
                <ProfilePhoto src={previewUrl ?? currentPhoto} name={name} size={225} />

                <p className="!text-[length:var(--font-size-subtitle-1)]">
                  Choose a photo to upload
                </p>

                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  Select a File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={PHOTO_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
                  className="hidden"
                  aria-label="Choose a photo to upload"
                  onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
                />

                <p>{file ? file.name : '(No file selected)'}</p>

                {phase === 'uploading' && file && (
                  <UploadProgressBar
                    transferredBytes={transferred}
                    totalBytes={file.size}
                    fileName={file.name}
                  />
                )}

                {phase === 'done' && (
                  <p className="flex items-center !gap-2 !text-[length:var(--font-size-callout)] !font-bold">
                    <LuCircleCheck aria-hidden className="text-core-green" />
                    Upload Complete
                  </p>
                )}

                {error && (
                  <p
                    role="alert"
                    className="!text-[length:var(--font-size-callout)] !font-bold !text-error-red"
                  >
                    {error}
                  </p>
                )}
              </div>
            </Dialog.Body>

            <Dialog.Footer height="64px" paddingX="24px" backgroundColor={CHROME_BG}>
              <div className="flex w-full justify-end !gap-6">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  disabled={phase === 'uploading'}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!canUpload}
                  isLoading={phase === 'uploading'}
                  loadingText="Uploading…"
                >
                  Update
                </Button>
              </div>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
