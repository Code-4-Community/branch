'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import Button from './Button';
import ShowPasswordCheckbox from './ShowPasswordCheckbox';
import TextInputField from './TextInputField';
import { PASSWORD_RULE, PASSWORD_RULE_MESSAGE } from './SetPasswordForm';
import { useApi } from '@/hooks/useApi';

/** The design tints the header and footer with Core Black/100 at 50%. */
const CHROME_BG =
  'color-mix(in srgb, var(--color-black-100) 50%, var(--color-core-white))';

interface PasswordResetModalProps {
  open: boolean;
  email: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Completes Cognito's forgot-password flow from the profile page. The pool
 * emails a code (`CONFIRM_WITH_CODE`), not a link, so this is the only place a
 * signed-in user can type that code — `/reset-password` is a public route and
 * AuthGate would bounce them off it.
 */
export default function PasswordResetModal({
  open,
  email,
  onClose,
  onSuccess,
}: PasswordResetModalProps) {
  const api = useApi();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [codeError, setCodeError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const isBusy = isConfirming || isResending;

  const reset = useCallback(() => {
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setCodeError('');
    setNewPasswordError('');
    setConfirmPasswordError('');
    setError(null);
    setIsConfirming(false);
    setIsResending(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  function handleClose() {
    reset();
    onClose();
  }

  function validate(): boolean {
    let valid = true;
    if (!code.trim()) {
      setCodeError('Please enter the verification code from your email');
      valid = false;
    } else {
      setCodeError('');
    }
    if (!newPassword || !PASSWORD_RULE.test(newPassword)) {
      setNewPasswordError(PASSWORD_RULE_MESSAGE);
      valid = false;
    } else {
      setNewPasswordError('');
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Password does not match');
      valid = false;
    } else {
      setConfirmPasswordError('');
    }
    return valid;
  }

  async function confirmReset() {
    if (!validate()) return;
    setError(null);
    setIsConfirming(true);
    try {
      await api.post('/auth/reset-password', {
        email,
        code: code.trim(),
        newPassword,
      });
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password');
    } finally {
      setIsConfirming(false);
    }
  }

  async function resendCode() {
    setError(null);
    setIsResending(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) handleClose();
      }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content width="100%" maxWidth="409px" marginX="4">
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
                Reset Password
              </Dialog.Title>
              <CloseButton onClick={handleClose} aria-label="Close" />
            </Dialog.Header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmReset();
              }}
            >
              <Dialog.Body paddingX="24px" paddingTop="30px" paddingBottom="24px">
                <div className="flex flex-col !gap-4">
                  <p className="!text-core-black">
                    We sent a verification code to {email}. Enter it below with
                    your new password.
                  </p>
                  <TextInputField
                    label="Verification code"
                    placeholder="Enter verification code"
                    required
                    inputMode="numeric"
                    name="verification-code"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={setCode}
                    isError={!!codeError}
                    errorMessage={codeError}
                  />
                  <TextInputField
                    label="New Password"
                    placeholder="Enter new password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    name="new-password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                    isError={!!newPasswordError}
                    errorMessage={newPasswordError}
                  />
                  <TextInputField
                    label="Confirm Password"
                    placeholder="Retype password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    isError={!!confirmPasswordError}
                    errorMessage={confirmPasswordError}
                  />
                  <ShowPasswordCheckbox
                    checked={showPassword}
                    onChange={setShowPassword}
                    label="Show passwords"
                  />
                  {error && (
                    <p role="alert" className="!text-[length:var(--font-size-callout)] !text-error-red">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    className="self-start !font-body !text-[length:var(--font-size-callout)] !font-bold !text-core-green disabled:!text-black-500"
                    onClick={resendCode}
                    disabled={isBusy}
                  >
                    Resend code
                  </button>
                </div>
              </Dialog.Body>

              <Dialog.Footer height="64px" paddingX="24px" backgroundColor={CHROME_BG}>
                <div className="flex w-full justify-end !gap-6">
                  <Button variant="secondary" onClick={handleClose} disabled={isBusy}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isConfirming}
                    loadingText="Resetting…"
                    disabled={isBusy}
                  >
                    Reset Password
                  </Button>
                </div>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
