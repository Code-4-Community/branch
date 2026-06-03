'use client';

import React, { useState, Suspense } from 'react';
import TextInputField from '@/app/components/TextInputField';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetPasswordContent() {
    const { resetPassword } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const email = searchParams.get('email') ?? '';
    const code = searchParams.get('code') ?? '';

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [newPasswordError, setNewPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    function validate(): boolean {
        let valid = true;

        const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!newPassword || !strongPassword.test(newPassword)) {
            setNewPasswordError('Password must be at least 8 characters with uppercase, lowercase, number, and symbol');
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

    async function handleResetPassword() {
        if (!validate()) return;
        setIsLoading(true);
        try {
            await resetPassword(email, code, newPassword);
        } catch {
            // expected without backend
        } finally {
            setIsLoading(false);
            setSubmitted(true);
        }
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
        <div className="flex flex-col items-center text-center w-80">
            <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">Reset Password</h1>
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
                onClick={handleResetPassword}
                loading={isLoading}
            >
                Reset Password
            </Button>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetPasswordContent />
        </Suspense>
    );
}
