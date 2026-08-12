'use client';
import { useCallback, useState } from 'react';
import { FileRejection, useDropzone } from 'react-dropzone';
import UploadProgressBar from './UploadProgressBar';
import FilePreview from './FilePreview';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface FileUploadProps {
  value: File | null;
  /** Called with the stored object URL once the upload lands, or null on clear. */
  onChange: (file: File | null, objectUrl: string | null) => void;
  onReject?: () => void;
  /** Performs the upload and resolves to the stored object URL. */
  upload: (file: File, onProgress: (transferredBytes: number) => void) => Promise<string>;
  /** When set, the dropzone is inert and explains why. */
  disabledReason?: string;
}

export default function FileUpload({ value, onChange, onReject, upload, disabledReason }: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [transferredBytes, setTransferredBytes] = useState(0);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploadFailed, setUploadFailed] = useState(false);

    const startUpload = useCallback(
        async (file: File) => {
        setPendingFile(file);
        setIsUploading(true);
        setUploadFailed(false);
        setTransferredBytes(0);

        try {
            const objectUrl = await upload(file, setTransferredBytes);
            setTransferredBytes(file.size);
            onChange(file, objectUrl);
        } catch {
            setUploadFailed(true);
            onChange(null, null);
        } finally {
            setIsUploading(false);
            setPendingFile(null);
        }
        },
        [onChange, upload],
    );

    {/*When the file is dropped, check if it's accepted*/}
    const onDrop = useCallback(
        (accepted: File[], rejections: FileRejection[]) => {
        if (rejections.length > 0) {
            setUploadFailed(false);
            onReject?.();
            return;
        }
        if (accepted[0]) startUpload(accepted[0]);
        },
        [startUpload, onReject],
    );

    {/*Dropzone component to allow user to drop in files*/}
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        maxSize: MAX_FILE_SIZE_BYTES,
        maxFiles: 1,
        multiple: false,
        disabled: isUploading || Boolean(disabledReason),
    });

    const borderColor = isDragActive
      ? 'var(--color-core-green)'
      : uploadFailed
        ? 'var(--color-error-red)'
        : 'var(--color-black-200)';

    if (isUploading && pendingFile) {
        return (
            <UploadProgressBar
                transferredBytes={transferredBytes}
                totalBytes={pendingFile.size}
                fileName={pendingFile.name}
            />
        );
    }

    // Selected-file state
    if (value) {
        return (
            <>
            <input {...getInputProps()} />
            <FilePreview
                file={value}
                onRemove={() => onChange(null, null)}
                onReplace={open}
            />
            </>
        );
    }

  {/*Empty Dropzone State*/}
  return (
    <div
      {...getRootProps()}
      style={{
        border: `1px dashed ${borderColor}`,
        borderRadius: '6px',
        padding: '32px 16px',
        cursor: disabledReason ? 'not-allowed' : 'pointer',
        opacity: disabledReason ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        transition: 'border-color 0.15s',
      }}
    >
      <input {...getInputProps()} />

      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-core-black)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>

      <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
        {isDragActive ? 'Drop the PDF here' : 'Upload PDF Receipt'}
      </p>

      <p style={{ fontSize: '12px', color: 'var(--color-black-500)', margin: '4px 0 0' }}>
        {disabledReason ?? 'PDF only'}
      </p>

      {uploadFailed && (
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-error-red)', margin: '8px 0 0' }}>
          File failed to upload
        </p>
      )}
    </div>
  );
}
