'use client';

import React, { useState } from 'react';
import TextInputField from '@/app/components/TextInputField';
import SetPasswordForm from '@/app/components/SetPasswordForm';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage() {
    const { forgotPassword, resetPassword } = useAuth();

    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');

    function validate(): boolean {
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailError('Please enter a valid email address');
            return false;
        }
        setEmailError('');
        return true;
    }

    async function handleRequestReset() {
        if (!validate()) return;
        setIsLoading(true);
        try {
            await forgotPassword(email);
            setConfirmError(null);
            setStep('confirm');
        } catch {
            setEmailError('Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleResend() {
        setIsLoading(true);
        setConfirmError(null);
        try {
            await forgotPassword(email);
        } catch {
            setConfirmError('Could not resend the code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleConfirm(newPassword: string, code?: string) {
        setIsLoading(true);
        setConfirmError(null);
        try {
            await resetPassword(email, code ?? '', newPassword);
            setStep('done');
        } catch (err) {
            setConfirmError(
                err instanceof Error
                    ? err.message
                    : 'Could not reset your password. Please try again.',
            );
        } finally {
            setIsLoading(false);
        }
    }

    if (step === 'done') {
        return (
            <div className="flex flex-col items-center text-center w-90">
                <div className="flex flex-col items-start gap-6">
                    <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold">Password Changed</h1>
                    <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center !text-core-black !mb-6">
                        Your password has been successfully changed!
                    </h5>
                </div>
                <Link
                    href="/login"
                    className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10 !text-center !font-bold"
                >
                    Back to login
                </Link>
            </div>
        );
    }

    if (step === 'confirm') {
        return (
            <div className="flex flex-col items-center text-center">
                <h5 className="![font-family:var(--font-body)] !text-[16px] !mb-6">
                    We sent a verification code to {email}. Enter it below with your new password.
                </h5>
                <SetPasswordForm
                    includeCode
                    onSubmit={handleConfirm}
                    error={confirmError}
                    isLoading={isLoading}
                />
                <button
                    type="button"
                    className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3"
                    onClick={handleResend}
                    disabled={isLoading}
                >
                    Resend code
                </button>
                <Link href="/login" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3">
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col shrink-0 items-start gap-[30px]">
            <div className="flex flex-col items-start gap-6">
                <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-bold">
                    Forgot your Password?
                </h1>
                <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center w-[312px] !ml-[41px] !text-core-black">
                    Please enter the email address you&apos;d like your password reset information sent to
                </h5>
            </div>
            <div className="flex flex-col items-start ml-[26px] gap-9">
                <TextInputField
                    label="Email *"
                    placeholder="Enter email address"
                    errorMessage={emailError}
                    isError={!!emailError}
                    value={email}
                    onChange={(value) => setEmail(value)}
                />
                <Button
                    className="![font-family:var(--font-body)] !text-[16px] !font-bold !bg-core-green !text-core-white !py-3 !px-[110px] !rounded !border-0"
                    onClick={handleRequestReset}
                    loading={isLoading}
                >
                    Request reset code
                </Button>
                <Link href="/login" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3 !px-[127px]">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
