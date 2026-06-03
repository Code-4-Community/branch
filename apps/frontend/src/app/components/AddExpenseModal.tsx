'use client';

import { useState } from 'react';
import { Button, Dialog, Portal, CloseButton, Stack } from '@chakra-ui/react';
import DropdownSelector from './DropdownSelector';
import { apiFetch } from '@/lib/api';

interface Project {
  project_id: number;
  name: string;
}

interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
  categories: string[];
  projects: Project[];
}

export default function AddExpenseModal({
  open,
  onClose,
  onSuccess,
  token,
  categories,
  projects,
}: AddExpenseModalProps) {
  const [newDate, setNewDate] = useState('');
  const [newType, setNewType] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newProject, setNewProject] = useState('');

  const [dateError, setDateError] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [descError, setDescError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetForm() {
    setNewDate('');
    setNewType('');
    setNewDescription('');
    setNewAmount('');
    setNewProject('');
    setDateError(false);
    setTypeError(false);
    setDescError(false);
    setAmountError(false);
    setProjectError(false);
    setSubmitError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    const hasDateError = !newDate.trim();
    const hasTypeError = !newType.trim();
    const hasDescError = !newDescription.trim();
    const hasAmountError = !newAmount.trim() || isNaN(Number(newAmount)) || Number(newAmount) < 0;
    const hasProjectError = !newProject.trim();

    setDateError(hasDateError);
    setTypeError(hasTypeError);
    setDescError(hasDescError);
    setAmountError(hasAmountError);
    setProjectError(hasProjectError);

    if (hasDateError || hasTypeError || hasDescError || hasAmountError || hasProjectError) return;

    const selectedProject = projects.find((p) => p.name === newProject);
    if (!selectedProject) {
      setProjectError(true);
      return;
    }

    try {
      await apiFetch('/expenditures', {
        method: 'POST',
        token,
        body: JSON.stringify({
          projectID: selectedProject.project_id,
          amount: Number(newAmount),
          category: newType,
          description: newDescription,
          spentOn: newDate,
        }),
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
            <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
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
                {/* Date */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Date*</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => {
                      setNewDate(e.target.value);
                      setDateError(false);
                    }}
                    style={{
                      border: `1px solid ${dateError ? 'var(--color-error-red)' : '#CBD5E0'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                      color: newDate ? 'inherit' : '#A0AEC0',
                    }}
                  />
                  {dateError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Select a date
                    </span>
                  )}
                </div>

                {/* Type of Expense */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Type of Expense*</label>
                  <DropdownSelector
                    options={categories}
                    placeholder="Select a type of expense"
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

                {/* Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Description*</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => {
                      setNewDescription(e.target.value);
                      setDescError(false);
                    }}
                    placeholder="Placeholder"
                    rows={4}
                    style={{
                      border: `1px solid ${descError ? 'var(--color-error-red)' : '#CBD5E0'}`,
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  {descError && (
                    <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                      Enter a description
                    </span>
                  )}
                </div>

                {/* Amount */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500 }}>Amount*</label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: `1px solid ${amountError ? 'var(--color-error-red)' : '#CBD5E0'}`,
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#f7fafc',
                        borderRight: '1px solid #CBD5E0',
                        fontSize: '14px',
                        color: '#718096',
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => {
                        setNewAmount(e.target.value);
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

                {/* Project */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                backgroundColor="var(--color-core-green)"
                color="var(--color-core-white)"
                onClick={handleSubmit}
              >
                Add Expense
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
