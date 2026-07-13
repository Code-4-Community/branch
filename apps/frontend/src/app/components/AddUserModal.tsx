'use client';

import { useState } from 'react';
import { Button, Dialog, Portal, CloseButton, Stack } from '@chakra-ui/react';
import TextInputField from './TextInputField';
import { apiFetch } from '@/lib/api';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
}

export default function AddUserModal({ open, onClose, onSuccess, token }: AddUserModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function resetForm() {
    setEmail('');
    setName('');
    setIsAdmin(false);
    setEmailError('');
    setNameError('');
    setSubmitError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    const hasEmailError = !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasNameError = !name.trim() || name.trim().length < 2;

    setEmailError(hasEmailError ? 'Please enter a valid email address' : '');
    setNameError(hasNameError ? 'Name must be at least 2 characters' : '');
    setSubmitError(null);

    if (hasEmailError || hasNameError) return;

    setIsLoading(true);
    try {
      await apiFetch('/users/', {
        method: 'POST',
        token,
        body: JSON.stringify({ email: email.toLowerCase(), name: name.trim(), isAdmin }),
      });
      resetForm();
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
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
                Add User
              </Dialog.Title>
              <CloseButton onClick={handleClose} />
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <TextInputField
                  label="Email *"
                  placeholder="Enter email address"
                  value={email}
                  onChange={setEmail}
                  isError={!!emailError}
                  errorMessage={emailError}
                />
                <TextInputField
                  label="Name *"
                  placeholder="Enter full name"
                  value={name}
                  onChange={setName}
                  isError={!!nameError}
                  errorMessage={nameError}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Admin
                </label>
                {submitError && (
                  <p style={{ color: 'var(--color-error-red)', fontSize: '14px' }}>{submitError}</p>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                borderColor="var(--color-core-green)"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                backgroundColor="var(--color-core-green)"
                color="var(--color-core-white)"
                onClick={handleSubmit}
                loading={isLoading}
              >
                Add User
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
