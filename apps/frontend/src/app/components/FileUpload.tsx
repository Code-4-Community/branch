'use client';
import { useCallback, useRef, useState } from 'react';
import { FileRejection, useDropzone } from 'react-dropzone';
import UploadProgressBar from './UploadProgressBar';
import FilePreview from './FilePreview';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface FileUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  onReject?: () => void;
  onUploadFail?: () => void;
}

export default function FileUpload({ value, onChange, onUploadFail, onReject }: FileUploadProps) {
    const [rejected, setRejected] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [transferredBytes, setTransferredBytes] = useState(0);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    {/*Simulated progress for testing
        TODO: update to use real progress of uploaded file */}
    const simulateUpload = useCallback(
        (file: File) => {
        setPendingFile(file);
        setIsUploading(true);
        setTransferredBytes(0);

        const total = file.size;
        const step = total / 15; // ~15 ticks to finish
        let transferred = 0;

        intervalRef.current = setInterval(() => {
            transferred += step;
            if (transferred >= total) {
            transferred = total;
            if (intervalRef.current) clearInterval(intervalRef.current);
            setTransferredBytes(total);
            setIsUploading(false);
            setPendingFile(null);
            onChange(file); // flip to selected state
            } else {
            setTransferredBytes(transferred);
            }
        }, 100);
        },
        [onChange],
    );

    {/*When the file is dropped, check if it's accepted*/}
    const onDrop = useCallback(
        (accepted: File[], rejections: FileRejection[]) => {
        if (rejections.length > 0) {
            setRejected(true);
            onReject?.();
            return;
        }
        setRejected(false);
        if (accepted[0]) simulateUpload(accepted[0]);
        },
        [simulateUpload, onReject],
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