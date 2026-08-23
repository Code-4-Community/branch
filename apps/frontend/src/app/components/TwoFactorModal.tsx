'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import Button from './Button';
import TextInputField from './TextInputField';
import { useApi } from '@/hooks/useApi';

/** The design tints the header and footer with Core Black/100 at 50%. */
const CHROME_BG =
  'color-mix(in srgb, var(--color-black-100) 50%, var(--color-core-white))';

interface MfaSetupResponse {
  secretCode: string;
  otpauthUrl: string;
}

interface TwoFactorModalProps {
  open: boolean;
  /** Current state, so the modal opens straight into enable or disable. */
  enabled: boolean;
  onClose: () => void;
  /** Called with the new state once Cognito has accepted the change. */
  onChanged: (enabled: boolean) => void;
}

/**
 * Two-factor enrollment, kept in a modal because the profile page has no room
 * for a QR code beside the account details. MFA is OPTIONAL on the Cognito pool
 * (infrastructure/aws/cognito.tf) and never forced at login, so this is the only
 * place a user turns it on or off.
 */
export default function TwoFactorModal({
  open,
  enabled,
  onClose,
  onChanged,
}: TwoFactorModalProps) {
  const api = useApi();

  const [enrollment, setEnrollment] = useState<MfaSetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const reset = useCallback(() => {
    setEnrollment(null);
    setQrDataUrl(null);
    setCode('');
    setCodeError('');
    setError(null);
    setIsBusy(false);
  }, []);

  // A reopened modal must not show the previous attempt's secret or error: the
  // secret from AssociateSoftwareToken is single-use per enrollment.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  function handleClose() {
    reset();
    onClose();
  }

  async function startEnrollment() {
    setError(null);
    setIsBusy(true);
    try {
      const setup = await api.post<MfaSetupResponse>('/auth/mfa-setup');
      setEnrollment(setup);
      setQrDataUrl(await QRCode.toDataURL(setup.otpauthUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start two-factor setup');
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyEnrollment() {
    if (!code) {
      setCodeError('Please enter the 6-digit code from your authenticator app');
      return;
    }
    setCodeError('');
    setIsBusy(true);
    try {
      await api.post('/auth/mfa-verify', { code });
      onChanged(true);
      handleClose();
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setIsBusy(false);
    }
  }

  async function disableMfa() {
    setError(null);
    setIsBusy(true);
    try {
      await api.post('/auth/mfa-disable');
      onChanged(false);
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not turn off two-factor authentication',
      );
    } finally {
      setIsBusy(false);
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
          {/* 409px is the Figma modal width; it shrinks with the viewport below that. */}
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
                Two-Factor Authentication
              </Dialog.Title>
              <CloseButton onClick={handleClose} aria-label="Close" />
            </Dialog.Header>

            <Dialog.Body paddingX="24px" paddingTop="30px" paddingBottom="24px">
              <div className="flex flex-col !gap-4">
                {enrollment ? (
                  <>
                    <p className="!text-core-black">
                      Scan this code with an authenticator app such as Google
                      Authenticator or Authy, then enter the 6-digit code it shows.
                    </p>
                    {qrDataUrl && (
                      <div className="flex justify-center">
                        <Image
                          src={qrDataUrl}
                          alt="Two-factor authentication QR code"
                          width={225}
                          height={225}
                          unoptimized
                        />
                      </div>
                    )}
                    <div>
                      <p className="!text-[length:var(--font-size-callout)] !font-bold !text-black-500">
                        Or enter this key manually
                      </p>
                      <p className="font-mono !text-[length:var(--font-size-callout)] break-all">
                        {enrollment.secretCode}
                      </p>
                    </div>
                    <TextInputField
                      label="Authentication code"
                      placeholder="123456"
                      required
                      inputMode="numeric"
                      value={code}
                      onChange={setCode}
                      isError={!!codeError}
                      errorMessage={codeError}
                    />
                  </>
                ) : (
                  <p className="!text-core-black">
                    {enabled
                      ? 'Two-factor authentication is on. You are asked for a code from your authenticator app each time you sign in. Turning it off means your password alone will get you in.'
                      : 'Add an authenticator app as a second step when you sign in, so a stolen password is not enough to reach your account.'}
                  </p>
                )}

                {error && (
                  <p className="!text-[length:var(--font-size-callout)] !text-error-red">{error}</p>
                )}
              </div>
            </Dialog.Body>

            <Dialog.Footer height="64px" paddingX="24px" backgroundColor={CHROME_BG}>
              <div className="flex w-full justify-end !gap-6">
                <Button variant="secondary" onClick={handleClose} disabled={isBusy}>
                  Cancel
                </Button>
                {enrollment ? (
                  <Button onClick={verifyEnrollment} isLoading={isBusy} loadingText="Verifying…">
                    Verify
                  </Button>
                ) : enabled ? (
                  <Button
                    variant="danger"
                    onClick={disableMfa}
                    isLoading={isBusy}
                    loadingText="Turning off…"
                  >
                    Turn Off
                  </Button>
                ) : (
                  <Button onClick={startEnrollment} isLoading={isBusy} loadingText="Starting…">
                    Set Up
                  </Button>
                )}
              </div>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
