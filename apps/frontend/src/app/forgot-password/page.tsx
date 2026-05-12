'use client';

import React, { useState } from 'react';
import TextInputField from '@/app/components/TextInputField';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage() {
    const { forgotPassword } = useAuth();

    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

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
            setSubmitted(true);
        } catch {
            setEmailError('Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleResend() {
        setIsLoading(true);
        try {
            await forgotPassword(email);
        } catch {
            // Silently fail — user can try again
        } finally {
            setIsLoading(false);
        }
    }

    if (submitted) {
        return (
            <div className="flex flex-col shrink-0 items-start gap-[30px]">
                <div className="flex flex-col items-start gap-6">
                    <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-bold !ml-5">
                        Reset Link Sent!
                    </h1>
                    <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center w-[326px] !mx-[7px] !text-core-black">
                        We sent a reset link to {email} with a link to reset your password.
                    </h5>
                </div>
                <div className="flex flex-col items-start gap-9">
                    <Button
                        className="![font-family:var(--font-body)] !text-[16px] !font-bold !bg-core-green !text-core-white !py-3 !px-[90px] !rounded !border-0"
                        onClick={handleResend}
                        loading={isLoading}
                    >
                        Request reset link again
                    </Button>
                    <Link href="/login" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3 !px-[127px]">
                        Back to login
                    </Link>
                </div>
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
                    Request reset link
                </Button>
                <Link href="/login" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3 !px-[127px]">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
