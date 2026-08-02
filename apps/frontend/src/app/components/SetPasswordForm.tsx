'use client';

import React, { useState } from 'react';
import TextInputField from './TextInputField';
import { Button } from '@chakra-ui/react';

/**
 * Reusable "new password + confirm" pair.
 *
 * Used by both the reset-password flow and the NEW_PASSWORD_REQUIRED step of
 * login, so the validation rules live in exactly one place. Replaces the old
 * NewPasswordForm, which was uncontrolled, unvalidated and imported nowhere.
 */

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters with uppercase, lowercase, number, and symbol';

interface SetPasswordFormProps {
  onSubmit: (newPassword: string) => Promise<void> | void;
  heading?: string;
  submitLabel?: string;
  /** Server-side error surfaced by the caller. */
  error?: string | null;
  isLoading?: boolean;
}

export default function SetPasswordForm({
  onSubmit,
  heading = 'Reset Password',
  submitLabel = 'Reset Password',
  error = null,
  isLoading = false,
}: SetPasswordFormProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  function validate(): boolean {
    let valid = true;

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

  async function handleSubmit() {
    if (!validate()) return;
    await onSubmit(newPassword);
  }

  return (
    <div className="flex flex-col items-center text-center w-80">
      <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">
        {heading}
      </h1>
      {error && (
        <p role="alert" className="!text-red-600 !text-[14px] !mb-4">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-4 w-full !mb-10">
        <TextInputField
          label="New Password *"
          placeholder="Enter new password"
          errorMessage={newPasswordError}
          isError={!!newPasswordError}
          value={newPassword}
          onChange={(value) => setNewPassword(value)}
        />
        <TextInputField
          label="Confirm Password *"
          placeholder="Retype password"
          errorMessage={confirmPasswordError}
          isError={!!confirmPasswordError}
          value={confirmPassword}
          onChange={(value) => setConfirmPassword(value)}
        />
      </div>
      <Button
        className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
        onClick={handleSubmit}
        loading={isLoading}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
