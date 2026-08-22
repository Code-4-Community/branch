'use client';

import React, { useEffect, useState } from 'react';
import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import Button from './Button';
import TextInputField from './TextInputField';

const CHROME_BG = 'var(--color-primary-100)';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** Rejecting leaves the dialog open and shows the reason. */
  onConfirm: () => Promise<void> | void;
  title: string;
  /** The record being removed, echoed back so the user can check the row. */
  itemName?: string;
  /**
   * What else disappears. Every foreign key in the schema is ON DELETE CASCADE,
   * so a delete here can take rows the user never sees — say so explicitly.
   */
  consequences?: React.ReactNode;
  confirmLabel?: string;
  /**
   * Gate the confirm button behind retyping `itemName`. For deletes that
   * cascade into financial history, where a misclick is unrecoverable.
   */
  requireTypedConfirmation?: boolean;
}

/**
 * The app's one delete confirmation. Every destructive action goes through it
 * so the wording, the red confirm button, the in-flight state and the failure
 * message stay identical — and so no delete ships without a confirm step.
 */
export default function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title,
  itemName,
  consequences,
  confirmLabel = 'Delete',
  requireTypedConfirmation = false,
}: ConfirmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  // Reopening after a failure should not inherit the previous attempt's error.
  useEffect(() => {
    if (open) {
      setError(null);
      setTyped('');
    }
  }, [open]);

  const confirmDisabled =
    requireTypedConfirmation && typed.trim() !== (itemName ?? '').trim();

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not delete. Please try again.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        // A delete in flight must not be dismissed out from under itself.
        if (!e.open && !deleting) onClose();
      }}
      role="alertdialog"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content width="100%" maxWidth="480px" marginX="4">
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
                {title}
              </Dialog.Title>
              <CloseButton
                onClick={onClose}
                disabled={deleting}
                aria-label="Close"
              />
            </Dialog.Header>

            <Dialog.Body paddingX="24px" paddingTop="24px" paddingBottom="24px">
              <div className="flex flex-col !gap-4">
                <p className="!text-base">
                  {itemName ? (
                    <>
                      Delete <span className="!font-bold">{itemName}</span>?
                    </>
                  ) : (
                    'Are you sure you want to delete this?'
                  )}
                </p>

                {consequences && (
                  <div className="!text-sm !text-black-700">{consequences}</div>
                )}

                <p className="!text-sm !text-black-700">
                  This cannot be undone.
                </p>

                {requireTypedConfirmation && itemName && (
                  <TextInputField
                    label={`Type "${itemName}" to confirm`}
                    value={typed}
                    onChange={setTyped}
                    placeholder={itemName}
                    disabled={deleting}
                  />
                )}

                {error && (
                  <p role="alert" className="!text-sm !font-bold !text-error-red">
                    {error}
                  </p>
                )}
              </div>
            </Dialog.Body>

            <Dialog.Footer height="64px" paddingX="24px" backgroundColor={CHROME_BG}>
              <div className="flex w-full justify-end !gap-6">
                <Button variant="secondary" onClick={onClose} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleConfirm}
                  disabled={confirmDisabled}
                  isLoading={deleting}
                  loadingText="Deleting…"
                >
                  {confirmLabel}
                </Button>
              </div>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
