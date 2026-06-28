import React from 'react';

interface UploadProgressBarProps {
  transferredBytes: number;
  totalBytes: number;
  fileName: string;
}

export default function UploadProgressBar ({
  transferredBytes,
  totalBytes,
  fileName,
}: UploadProgressBarProps) {
  const progress =
    totalBytes !== 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;

  return (
    <div
      style={{
        border: '1px dashed var(--color-black-200)',
        borderRadius: '6px',
        padding: '32px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}
    >
      {/* bar + percent on one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '420px' }}>
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-black-100)',
            borderRadius: '9999px',
            height: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              backgroundColor: 'var(--color-core-green)',
              height: '100%',
              borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span style={{ fontSize: '14px', color: 'var(--color-core-black)', minWidth: '40px', textAlign: 'right' }}>
          {progress}%
        </span>
      </div>

      {/* filename below the bar */}
      <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>
        {fileName} uploading...
      </p>
    </div>
  );
}