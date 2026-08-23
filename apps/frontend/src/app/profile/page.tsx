'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { Button } from '@chakra-ui/react';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import TextInputField from '../components/TextInputField';
import { useApi } from '@/hooks/useApi';

interface MfaStatusResponse {
  enabled: boolean;
}

interface MfaSetupResponse {
  secretCode: string;
  otpauthUrl: string;
}

/**
 * Self-service TOTP MFA enrollment. MFA is OPTIONAL on the Cognito pool
 * (infrastructure/aws/cognito.tf) -- it is never forced during login, so this
 * page is the only place a user can turn it on or off for their own account.
 */
export default function ProfilePage() {
  const api = useApi();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enrollment, setEnrollment] = useState<MfaSetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const status = await api.get<MfaStatusResponse>('/auth/mfa-status');
      setEnabled(status.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load MFA status');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startEnrollment() {
    setError(null);
    setCode('');
    setCodeError('');
    setIsBusy(true);
    try {
      const setup = await api.post<MfaSetupResponse>('/auth/mfa-setup');
      setEnrollment(setup);
      setQrDataUrl(await QRCode.toDataURL(setup.otpauthUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start MFA enrollment');
    } finally {
      setIsBusy(false);
    }
  }

  function cancelEnrollment() {
    setEnrollment(null);
    setQrDataUrl(null);
    setCode('');
    setCodeError('');
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
      cancelEnrollment();
      setEnabled(true);
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
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable MFA');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header text="Profile" />
        <div className="flex flex-col !gap-6 !px-4 !py-5 sm:!px-8">
          {isLoading && <LoadingState label="Loading profile…" />}
          {error && <p className="!text-red-600">{error}</p>}

          {!isLoading && (
            <div className="max-w-md">
              <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold !mb-2">
                Two-factor authentication
              </h3>
              <p className="!mb-4">
                {enabled
                  ? 'Two-factor authentication is on. You’ll be asked for a code from your authenticator app each time you sign in.'
                  : 'Add an authenticator app as a second step when you sign in.'}
              </p>

              {enabled && !enrollment && (
                <Button
                  className="![font-family:var(--font-body)] !rounded !bg-core-white !border !border-core-green !text-core-green !px-4 !py-1.5"
                  onClick={disableMfa}
                  loading={isBusy}
                >
                  Turn off two-factor authentication
                </Button>
              )}

              {!enabled && !enrollment && (
                <Button
                  className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white !px-4 !py-1.5"
                  onClick={startEnrollment}
                  loading={isBusy}
                >
                  Set up two-factor authentication
                </Button>
              )}

              {enrollment && (
                <div className="flex flex-col !gap-4">
                  <p>
                    Scan this QR code with your authenticator app (e.g. Google
                    Authenticator, Authy), or enter the key manually.
                  </p>
                  {qrDataUrl && (
                    <Image src={qrDataUrl} alt="MFA QR code" width={200} height={200} unoptimized />
                  )}
                  <p className="font-mono text-sm break-all">{enrollment.secretCode}</p>
                  <TextInputField
                    label="Authentication code *"
                    placeholder="123456"
                    errorMessage={codeError}
                    isError={!!codeError}
                    value={code}
                    onChange={(value) => setCode(value)}
                  />
                  <div className="flex !gap-3">
                    <Button
                      className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white !px-4 !py-1.5"
                      onClick={verifyEnrollment}
                      loading={isBusy}
                    >
                      Verify and enable
                    </Button>
                    <Button
                      className="![font-family:var(--font-body)] !rounded !bg-core-white !border !border-gray-300 !px-4 !py-1.5"
                      onClick={cancelEnrollment}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
