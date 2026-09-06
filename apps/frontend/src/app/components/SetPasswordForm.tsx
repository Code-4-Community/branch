'use client';

import React, { useState } from 'react';
import TextInputField from './TextInputField';
import ShowPasswordCheckbox from './ShowPasswordCheckbox';
import { Button } from '@chakra-ui/react';

/**
 * Reusable "new password + confirm" pair.
 *
 * Used by the reset-password and forgot-password flows and the
 * NEW_PASSWORD_REQUIRED step of login, so the validation rules live in
 * exactly one place. Replaces the old NewPasswordForm, which was
 * uncontrolled, unvalidated and imported nowhere.
 */

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters with uppercase, lowercase, number, and symbol';

interface SetPasswordFormProps {
  onSubmit: (newPassword: string, code?: string) => Promise<void> | void;
  heading?: string;
  submitLabel?: string;
  /** Server-side error surfaced by the caller. */
  error?: string | null;
  isLoading?: boolean;
  includeCode?: boolean;
}

export default function SetPasswordForm({
  onSubmit,
  heading = 'Reset Password',
  submitLabel = 'Reset Password',
  error = null,
  isLoading = false,
  includeCode = false,
}: SetPasswordFormProps) {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function validate(): boolean {
    let valid = true;

    if (includeCode) {
      if (!code.trim()) {
        setCodeError('Please enter the verification code from your email');
        valid = false;
      } else {
        setCodeError('');
      }
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(newPassword, includeCode ? code.trim() : undefined);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center text-center w-80"
    >
      <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">
        {heading}
      </h1>
      {error && (
        <p role="alert" className="!text-red-600 !text-[14px] !mb-4">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-4 w-full !mb-10">
        {includeCode && (
          <TextInputField
            label="Verification code *"
            placeholder="Enter verification code"
            errorMessage={codeError}
            isError={!!codeError}
            value={code}
            onChange={setCode}
            inputMode="numeric"
            name="verification-code"
            autoComplete="one-time-code"
          />
        )}
        <TextInputField
          label="New Password *"
          placeholder="Enter new password"
          errorMessage={newPasswordError}
          isError={!!newPasswordError}
          value={newPassword}
          onChange={(value) => setNewPassword(value)}
          type={showPassword ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
        />
        <TextInputField
          label="Confirm Password *"
          placeholder="Retype password"
          errorMessage={confirmPasswordError}
          isError={!!confirmPasswordError}
          value={confirmPassword}
          onChange={(value) => setConfirmPassword(value)}
          type={showPassword ? 'text' : 'password'}
          name="confirm-password"
          autoComplete="new-password"
        />
        <ShowPasswordCheckbox
          checked={showPassword}
          onChange={setShowPassword}
          label="Show passwords"
        />
      </div>
      <Button
        type="submit"
        className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
        loading={isLoading}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
