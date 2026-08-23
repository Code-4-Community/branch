'use client';

import { useCallback, useState } from 'react';
import { Button, Dialog, Portal, CloseButton, Stack } from '@chakra-ui/react';
import DropdownSelector from './DropdownSelector';
import { useApi } from '@/hooks/useApi';
import FileUpload from './FileUpload';
import { FiDollarSign } from 'react-icons/fi';
import { getReceiptUploadUrl, uploadReceiptToS3 } from '@/lib/expenditures';
import { Project } from '@/types';

function formatAmountDisplay(digits: string): string {
  if (!digits) return '';
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  return trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: string[];
  projects: Pick<Project, 'project_id' | 'name'>[];
}

export default function AddExpenseModal({
  open,
  onClose,
  onSuccess,
  categories,
  projects,
}: AddExpenseModalProps) {
  const api = useApi();

  const [newDate, setNewDate] = useState('');
  const [newType, setNewType] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [amountDigits, setAmountDigits] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const [dateError, setDateError] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [descError, setDescError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const amount = amountDigits ? Number(amountDigits) : 0;
  
  const isFormValid =
    newDate.trim().length > 0 &&
    newType.trim().length > 0 &&
    newDescription.trim().length > 0 &&
    amountDigits.length > 0 &&
    amount > 0 &&
    newProject.trim().length > 0;

  function resetForm() {
    setNewDate('');
    setNewType('');
    setNewDescription('');
    setAmountDigits('');
    setNewProject('');
    setNewFile(null);
    setReceiptUrl(null);
    setDateError(false);
    setTypeError(false);
    setDescError(false);
    setAmountError(false);
    setProjectError(false);
    setSubmitError(null);
    setFileError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedProject = projects.find((p) => p.name === newProject);

  // The receipt is stored under its project's prefix, so the project has to be
  // chosen before the file can go anywhere.
  const uploadReceipt = useCallback(
    async (file: File, onProgress: (transferredBytes: number) => void) => {
      if (!selectedProject) throw new Error('Select a project first');
      const { uploadUrl, objectUrl } = await getReceiptUploadUrl(
        file.name,
        selectedProject.project_id,
      );
      await uploadReceiptToS3(uploadUrl, file, onProgress);
      return objectUrl;
    },
    [selectedProject],
  );

  async function handleSubmit() {
    const hasDateError = !newDate.trim();
    const hasTypeError = !newType.trim();
    const hasDescError = !newDescription.trim();
    const hasAmountError = !amountDigits || amount <= 0;
    const hasProjectError = !newProject.trim();
    const hasFileError = !newFile || !receiptUrl;

    setDateError(hasDateError);
    setTypeError(hasTypeError);
    setDescError(hasDescError);
    setAmountError(hasAmountError);
    setProjectError(hasProjectError);
    setFileError(hasFileError ? 'Please upload an image of the receipt' : null);


    if (hasDateError || hasTypeError || hasDescError || hasAmountError || hasProjectError || hasFileError) return;

    if (!selectedProject) {
      setProjectError(true);
      return;
    }

    try {
      await api.post('/expenditures', {
        projectID: selectedProject.project_id,
        amount,
        category: newType,
        description: newDescription,
        spentOn: newDate,
        receiptUrl,
      });

      resetForm();
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create expense');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) handleClose(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display="flex" justifyContent="space-between" alignItems="center" backgroundColor="var(--color-black-100)">
              <Dialog.Title
                fontFamily="var(--font-heading)"
                fontSize="var(--font-size-heading-3)"
                fontWeight={600}
              >
                Add New Expense
              </Dialog.Title>
              <CloseButton onClick={handleClose} />
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: '16px' }}>
                  {/* Date */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '14px', fontWeight: 500 }}>Date*</label>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => {
                          setNewDate(e.target.value);
                          setDateError(false);
                        }}
                        className="date-input"
                        style={{
                          borderTop: `1px solid ${dateError ? 'var(--color-error-red)' : 'var(--color-black-200)'}`,
                          borderBottom: `1px solid ${dateError ? 'var(--color-error-red)' : 'var(--color-black-200)'}`,
                          borderLeft: `1px solid ${dateError ? 'var(--color-error-red)' : 'var(--color-black-200)'}`,
                          borderRight: 'none',
                          borderRadius: '6px 0 0 6px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          outline: 'none',
                          width: 'calc(100% - 40px)',
                          fontFamily: 'inherit',
                          color: newDate ? 'inherit' : 'var(--color-black-400)',
                          boxSizing: 'border-box',
                        }}
                      />
                      {/* custom calendar icon box on the right */}
                      <span
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'var(--color-black-100)',
                          borderTop: '1px solid var(--color-black-200)',
                          borderRight: '1px solid var(--color-black-200)',
                          borderBottom: '1px solid var(--color-black-200)',
                          borderRadius: '0 6px 6px 0',
                          pointerEvents: 'none',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-black-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '14px', fontWeight: 500 }}>Amount*</label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: `1px solid ${amountError ? 'var(--color-error-red)' : 'var(--color-black-200)'}`,
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          padding: '8px 0px 8px 12px',
                          fontSize: '14px',
                          color: 'var(--color-black-500)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <FiDollarSign size={20} strokeWidth={2.5}/>
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatAmountDisplay(amountDigits)}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '');
                          setAmountDigits(digitsOnly.slice(0, 9));
                          setAmountError(false);
                        }}
                        placeholder="Enter the Amount"
                        style={{
                          border: 'none',
                          padding: '8px 12px',
                          fontSize: '14px',
                          outline: 'none',
                          width: '100%',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    {amountError && (
                      <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                        Enter a valid amount
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
                  {/* Type of Expense */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '14px', fontWeight: 500 }}>Type of Expense*</label>
                    <DropdownSelector
                      options={categories}
                      placeholder="Select type"
                      multiSelect={false}
                      value={newType}
                      onChange={(val) => {
                        setNewType(val as string);
                        setTypeError(false);
                      }}
                    />
                    {typeError && (
                      <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                        Select a type of expense
                      </span>
                    )}
                  </div>
                  {/* Project */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: 0 }}>
                    <label style={{ fontSize: '14px', fontWeight: 500 }}>Project*</label>
                    <DropdownSelector
                      options={projects.map((p) => p.name)}
                      placeholder="Select a project"
                      multiSelect={false}
                      value={newProject}
                      onChange={(val) => {
                        setNewProject(val as string);
                        setProjectError(false);
                      }}
                    />
                    {projectError && (
                      <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                        Select a project
                      </span>
                    )}
                  </div>
                </div>
                {/* Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Description*</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => {
                      if (e.target.value.length > 500) return;
                      setNewDescription(e.target.value);
                      setDescError(false);
                    }}
                    placeholder="Placeholder"
                    rows={4}
                    maxLength={500}
                    style={{
                      border: `1px solid ${descError ? 'var(--color-error-red)' : 'var(--color-black-200)'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                      resize: 'none',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--color-black-500)', textAlign: 'right' }}>
                    {newDescription.length}/500
                  </span>
                  {descError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Enter a description
                    </span>
                  )}
                </div>

                {/* Upload Receipt */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Upload Receipt</label>
                  <FileUpload
                    value={newFile}
                    upload={uploadReceipt}
                    disabledReason={selectedProject ? undefined : 'Select a project first'}
                    onChange={(file, objectUrl) => {
                      setNewFile(file);
                      setReceiptUrl(objectUrl);
                      setFileError(null);
                    }}
                    onReject={() => setFileError('File type not supported')}
                  />
                  {fileError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px', fontStyle: 'italic', fontWeight: 600 }}>
                      {fileError}
                    </span>
                  )}
                </div>

                {/* Submit error */}
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
              >
                Cancel
              </Button>
              <Button
                backgroundColor={isFormValid ? 'var(--color-core-green)' : 'var(--color-primary-500)'}
                color="var(--color-core-white)"
                disabled={!isFormValid}
                onClick={handleSubmit}
                cursor={isFormValid ? 'pointer' : 'not-allowed'}
              >
                Submit For Review
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
