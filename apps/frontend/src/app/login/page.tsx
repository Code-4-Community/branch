'use client';

import React, { Suspense, useState } from 'react';
import TextInputField from '../components/TextInputField';
import SetPasswordForm from '../components/SetPasswordForm';
import ShowPasswordCheckbox from '../components/ShowPasswordCheckbox';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';
import { useAuth, type LoginResult } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { safeNextPath } from '@/lib/routes';

type Challenge = Extract<LoginResult, { status: 'challenge' }>;

function LoginPageContent() {
    const { login, respondToChallenge } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Where to land after signing in. AuthGate sets ?next= when it bounces an
    // unauthenticated user off a protected page; safeNextPath rejects anything
    // that isn't a same-origin path, so a crafted link can't redirect offsite.
    // With no ?next= we hand off to "/" rather than naming a page: the landing
    // route depends on isAdmin, which only arrives with GET /auth/me.
    const next = safeNextPath(searchParams.get('next'), '/');

    const [email, setEmail] = useState('');
    const [password, setPasswordValue] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [formError, setFormError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // 'credentials' -> optionally 'newPassword' or 'mfaCode'. The context
    // already returns the challenge and chains further ones, so a NEW_PASSWORD
    // step followed by an MFA step just works.
    const [step, setStep] = useState<'credentials' | 'newPassword' | 'mfaCode'>('credentials');
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [mfaCode, setMfaCode] = useState('');
    const [mfaCodeError, setMfaCodeError] = useState('');

    function validate(): boolean {
        let valid = true;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailError('Please enter a valid email address');
            valid = false;
        } else {
            setEmailError('');
        }

        if (!password) {
            setPasswordError('Please enter valid password');
            valid = false;
        } else {
            setPasswordError('');
        }

        return valid;
    }

    /** Report a failure honestly instead of blaming the user's credentials. */
    function reportError(err: unknown) {
        if (err instanceof ApiError) {
            if (err.status === 400 || err.status === 401) {
                setPasswordError('Incorrect email or password. Please try again.');
            } else {
                setFormError(err.message);
            }
            return;
        }
        // fetch rejects with a TypeError when the request never reached a server.
        // Logged because that's not the only way to land here — any non-ApiError
        // throw (e.g. a bug elsewhere in the login path) shows this same message.
        console.error('Login failed with a non-ApiError:', err);
        setFormError('Cannot reach the server. Check your connection and try again.');
    }

    function handleResult(result: LoginResult) {
        if (result.status === 'authenticated') {
            router.replace(next);
            return;
        }

        if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
            setChallenge(result);
            setStep('newPassword');
            return;
        }

        if (result.challengeName === 'SOFTWARE_TOKEN_MFA') {
            setChallenge(result);
            setMfaCode('');
            setMfaCodeError('');
            setStep('mfaCode');
            return;
        }

        setFormError(
            `This account requires ${result.challengeName}, which isn't supported yet. Contact an administrator.`,
        );
    }

    async function handleLogin() {
        setFormError('');
        if (!validate()) return;

        setIsLoading(true);
        try {
            handleResult(await login(email, password));
        } catch (err) {
            reportError(err);
        } finally {
            setIsLoading(false);
        }
    }

    // Submitting a real form — rather than clicking a bare button — is what lets
    // the browser offer to save the credentials.
    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        await handleLogin();
    }

    async function handleNewPassword(newPassword: string) {
        if (!challenge) return;
        setFormError('');
        setIsLoading(true);
        try {
            handleResult(await respondToChallenge({ ...challenge, newPassword }));
        } catch (err) {
            reportError(err);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleMfaCode() {
        if (!challenge) return;
        if (!mfaCode) {
            setMfaCodeError('Please enter the 6-digit code from your authenticator app');
            return;
        }
        setMfaCodeError('');
        setIsLoading(true);
        try {
            handleResult(await respondToChallenge({ ...challenge, code: mfaCode }));
        } catch (err) {
            // Not reportError(): that helper assumes a credentials-step 400/401
            // means a wrong password, which would mislabel an expired session or
            // wrong TOTP code here.
            if (err instanceof ApiError) {
                setMfaCodeError(err.message);
            } else {
                console.error('MFA verification failed with a non-ApiError:', err);
                setMfaCodeError('Cannot reach the server. Check your connection and try again.');
            }
        } finally {
            setIsLoading(false);
        }
    }

    if (step === 'newPassword') {
        return (
            <div className="flex min-h-screen items-center justify-center px-4">
                <div className="flex flex-col items-center text-center">
                    <h5 className="![font-family:var(--font-body)] !text-[16px] !mb-6">
                        Your account needs a new password before you can sign in.
                    </h5>
                    <SetPasswordForm
                        heading="Set a new password"
                        submitLabel="Set password and sign in"
                        onSubmit={handleNewPassword}
                        error={formError || null}
                        isLoading={isLoading}
                    />
                </div>
            </div>
        );
    }

    if (step === 'mfaCode') {
        return (
            <div className="flex min-h-screen items-center justify-center px-4">
                <div className="flex flex-col items-center text-center w-80">
                    <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">
                        Enter your code
                    </h1>
                    <h5 className="![font-family:var(--font-body)] !text-[16px] !mb-6">
                        Enter the 6-digit code from your authenticator app.
                    </h5>
                    <div className="flex flex-col gap-4 w-full !mb-10">
                        <TextInputField
                            label="Authentication code *"
                            placeholder="123456"
                            errorMessage={mfaCodeError}
                            isError={!!mfaCodeError}
                            value={mfaCode}
                            onChange={(value) => setMfaCode(value)}
                        />
                    </div>
                    <Button
                        className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
                        onClick={handleMfaCode}
                        loading={isLoading}
                    >
                        Verify
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
        <form onSubmit={handleSubmit} className="flex flex-col items-center text-center w-80">
            <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">Login</h1>
            <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold !mb-6">BRANCH Accounting Platform</h5>
            {formError && (
                <p role="alert" className="!text-red-600 !text-[14px] !mb-4">
                    {formError}
                </p>
            )}
            <div className="flex flex-col gap-4 w-full !mb-10">
                <TextInputField
                    label="Email *"
                    placeholder="Enter email address"
                    errorMessage={emailError}
                    isError={!!emailError}
                    value={email}
                    onChange={(value) => setEmail(value)}
                    type="email"
                    name="email"
                    autoComplete="username"
                />
                <TextInputField
                    label="Password *"
                    placeholder="Enter password"
                    errorMessage={passwordError}
                    isError={!!passwordError}
                    value={password}
                    onChange={(value) => setPasswordValue(value)}
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                />
                <ShowPasswordCheckbox checked={showPassword} onChange={setShowPassword} />
            </div>
            <Button
                type="submit"
                className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
                loading={isLoading}
            >
                Login
            </Button>
            <Link href="/forgot-password" className="!text-core-green !font-bold ![font-family:var(--font-body)] !text-[16px]">
                Forgot password?
            </Link>
        </form>
        </div>
    );
}

// useSearchParams must be inside a Suspense boundary or `next build` fails
// under output: 'export'.
export default function LoginPage() {
    return (
        <Suspense>
            <LoginPageContent />
        </Suspense>
    );
}
