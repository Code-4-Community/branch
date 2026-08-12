'use client';

import React, { Suspense, useState } from 'react';
import TextInputField from '../components/TextInputField';
import SetPasswordForm from '../components/SetPasswordForm';
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

    // 'credentials' -> optionally 'newPassword'. Adding a TOTP step later is one
    // more value here and one more case in handleResult — the context already
    // returns the challenge and chains further ones.
    const [step, setStep] = useState<'credentials' | 'newPassword'>('credentials');
    const [challenge, setChallenge] = useState<Challenge | null>(null);

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

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center text-center w-80">
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
                />
                <TextInputField
                    label="Password *"
                    placeholder="Enter password"
                    errorMessage={passwordError}
                    isError={!!passwordError}
                    value={password}
                    onChange={(value) => setPasswordValue(value)}
                />
            </div>
            <Button
                className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
                onClick={handleLogin}
                loading={isLoading}
            >
                Login
            </Button>
            <Link href="/forgot-password" className="!text-core-green !font-bold ![font-family:var(--font-body)] !text-[16px]">
                Forgot password?
            </Link>
        </div>
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
