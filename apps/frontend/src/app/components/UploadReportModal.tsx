'use client';

import { useRef, useState } from 'react';
import { Button, Dialog, Portal, CloseButton, Stack } from '@chakra-ui/react';
import DropdownSelector from './DropdownSelector';
import { uploadReport, type Project } from '@/lib/reports';

const REPORT_TYPES = ['Technical', 'Narrative'];
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

interface UploadReportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  projects: Project[];
}

export default function UploadReportModal({
  open,
  onClose,
  onSuccess,
  token,
  projects,
}: UploadReportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [reportType, setReportType] = useState('');

  const [fileError, setFileError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [reportTypeError, setReportTypeError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setFile(null);
    setTitle('');
    setProjectName('');
    setReportType('');
    setFileError(false);
    setTitleError(false);
    setProjectError(false);
    setReportTypeError(false);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected) {
      const ext = '.' + selected.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setFileError(true);
        setFile(null);
        return;
      }
    }
    setFile(selected);
    setFileError(false);
  }

  async function handleSubmit() {
    const hasFileError = !file;
    const hasTitleError = !title.trim();
    const hasProjectError = !projectName;
    const hasReportTypeError = !reportType;

    setFileError(hasFileError);
    setTitleError(hasTitleError);
    setProjectError(hasProjectError);
    setReportTypeError(hasReportTypeError);

    if (hasFileError || hasTitleError || hasProjectError || hasReportTypeError) return;

    const selectedProject = projects.find((p) => p.name === projectName);
    if (!selectedProject) {
      setProjectError(true);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    try {
      await uploadReport(
        file!,
        title.trim(),
        selectedProject.project_id,
        reportType.toLowerCase() as 'technical' | 'narrative',
        token,
      );
      resetForm();
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to upload report');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) handleClose(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
              <Dialog.Title
                fontFamily="var(--font-heading)"
                fontSize="var(--font-size-heading-3)"
                fontWeight={600}
              >
                Upload New Report
              </Dialog.Title>
              <CloseButton onClick={handleClose} />
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap={4}>
                {/* File picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>File* (PDF or DOCX)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileChange}
                    style={{
                      border: `1px solid ${fileError ? 'var(--color-error-red)' : '#CBD5E0'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      width: '100%',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  />
                  {fileError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Select a PDF or DOCX file
                    </span>
                  )}
                </div>

                {/* Title */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Title*</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setTitleError(false); }}
                    placeholder="Enter report title"
                    style={{
                      border: `1px solid ${titleError ? 'var(--color-error-red)' : '#CBD5E0'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                    }}
                  />
                  {titleError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Enter a title
                    </span>
                  )}
                </div>

                {/* Project */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Project*</label>
                  <DropdownSelector
                    options={projects.map((p) => p.name)}
                    placeholder="Select a project"
                    multiSelect={false}
                    value={projectName}
                    onChange={(val) => { setProjectName(val as string); setProjectError(false); }}
                  />
                  {projectError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Select a project
                    </span>
                  )}
                </div>

                {/* Report type */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Report Type*</label>
                  <DropdownSelector
                    options={REPORT_TYPES}
                    placeholder="Select a report type"
                    multiSelect={false}
                    value={reportType}
                    onChange={(val) => { setReportType(val as string); setReportTypeError(false); }}
                  />
                  {reportTypeError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Select a report type
                    </span>
                  )}
                </div>

                {submitError && (
                  <p style={{ color: 'var(--color-error-red)', fontSize: '14px' }}>
                    {submitError}
                  </p>
                )}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button
                variant="outline"
                borderColor="var(--color-core-green)"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                backgroundColor="var(--color-core-green)"
                color="var(--color-core-white)"
                onClick={handleSubmit}
                loading={loading}
              >
                Upload
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
