'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import SetPasswordForm from '@/app/components/SetPasswordForm';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetPasswordContent() {
    const { resetPassword } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const email = searchParams.get('email') ?? '';
    const code = searchParams.get('code') ?? '';

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function handleResetPassword(newPassword: string) {
        setIsLoading(true);
        setError(null);
        try {
            await resetPassword(email, code, newPassword);
            // Only on success. This used to live in `finally`, so the
            // "Password Changed" screen appeared even when the request failed
            // and users believed a password that had not changed.
            setSubmitted(true);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Could not reset your password. Please try again.',
            );
        } finally {
            setIsLoading(false);
        }
    }

    // Without both query params there is nothing to submit; posting empty
    // strings would just produce a confusing server-side error.
    if (!email || !code) {
        return (
            <div className="flex flex-col items-center text-center w-90 gap-6">
                <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold">
                    Link expired
                </h1>
                <h5 className="![font-family:var(--font-body)] !text-[16px] !text-core-black">
                    This password reset link is invalid or has expired. Request a new one to
                    continue.
                </h5>
                <Link
                    href="/forgot-password"
                    className="!text-core-green !font-bold ![font-family:var(--font-body)] !text-[16px]"
                >
                    Request a new reset link
                </Link>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center text-center w-90">
                <div className="flex flex-col items-start gap-6">
                    <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold">Password Changed</h1>
                    <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center !text-core-black !mb-6">
                        Your password has been successfully changed!
                    </h5>
                </div>
                <Button
                    className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
                    onClick={() => router.push('/login')}
                >
                    Back to login
                </Button>
            </div>
        );
    }

    return (
        <SetPasswordForm
            onSubmit={handleResetPassword}
            error={error}
            isLoading={isLoading}
        />
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetPasswordContent />
        </Suspense>
    );
}
