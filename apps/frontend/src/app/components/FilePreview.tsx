'use client';

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
  onReplace: () => void;
}

export default function FilePreview({ file, onRemove, onReplace }: FilePreviewProps) {
  const url = URL.createObjectURL(file);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid var(--color-black-200)',
          borderRadius: '6px',
          padding: '12px 16px',
          gap: '16px',
        }}
      >
        {/* File name displayed */}
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--color-core-green)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {file.name}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          {/*View pdf & download buttons*/}
          <a href={url} target="_blank" rel="noopener noreferrer"
             style={{ fontSize: '14px', color: 'var(--color-core-green)', textDecoration: 'none' }}>
            view pdf
          </a>
          <a href={url} download={file.name}
             style={{ fontSize: '14px', color: 'var(--color-core-green)', textDecoration: 'none' }}>
            download
          </a>
          {/*Remove file button*/}
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-black-500)', fontSize: '18px', padding: 0, lineHeight: 1 }}
            aria-label="Remove file"
          >
            ×
          </button>
        </div>
      </div>

      {/* Upload Complete row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-core-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="8 12 11 15 16 9" />
        </svg>
        <span style={{ fontSize: '14px', fontWeight: 400 }}>Upload Complete</span>
      </div>

      {/* Select a File button */}
      <button
        type="button"
        onClick={onReplace}
        style={{
          alignSelf: 'flex-end',
          backgroundColor: 'var(--color-core-green)',
          color: 'var(--color-core-white)',
          border: 'none',
          borderRadius: '6px',
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        Select a File
      </button>
    </div>
  );
}