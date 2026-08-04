'use client';
import { useCallback } from 'react';
import { FileRejection, useDropzone } from 'react-dropzone';
import UploadProgressBar from './UploadProgressBar';
import FilePreview from './FilePreview';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface UploadProgress {
  transferredBytes: number;
  totalBytes: number;
  fileName: string;
}

interface FileUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  onReject?: () => void;
  /**
   * Live progress of the real upload, driven by the parent. The file is sent
   * when the form is submitted -- not on drop -- because the presigned URL is
   * per project, and because a file dropped into an abandoned form would
   * otherwise leave an orphaned object in the bucket.
   */
  progress?: UploadProgress | null;
}

export default function FileUpload({ value, onChange, onReject, progress }: FileUploadProps) {
    const isUploading = progress !== null && progress !== undefined;

    {/*When the file is dropped, check if it's accepted*/}
    const onDrop = useCallback(
        (accepted: File[], rejections: FileRejection[]) => {
        if (rejections.length > 0) {
            onReject?.();
            return;
        }
        if (accepted[0]) onChange(accepted[0]);
        },
        [onChange, onReject],
    );

    {/*Dropzone component to allow user to drop in files*/}
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        maxSize: MAX_FILE_SIZE_BYTES,
        maxFiles: 1,
        multiple: false,
        disabled: isUploading,
    });

    const borderColor = isDragActive
      ? 'var(--color-core-green)'
      : 'var(--color-black-200)';

    if (isUploading) {
        return (
            <UploadProgressBar
                transferredBytes={progress.transferredBytes}
                totalBytes={progress.totalBytes}
                fileName={progress.fileName}
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
                onRemove={() => onChange(null)}
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
        cursor: 'pointer',
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
        PDF only
      </p>
      
    </div>
  );
}