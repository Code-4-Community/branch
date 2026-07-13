'use client';

import React, { useState } from 'react';
import TextInputField from '../components/TextInputField';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login, setPassword } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPasswordValue] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // NEW_PASSWORD_REQUIRED challenge state
    const [challenge, setChallenge] = useState<{ session: string; email: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordError, setNewPasswordError] = useState('');

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

    async function handleLogin() {
        if (!validate()) return;

        setIsLoading(true);
        try {
            const result = await login(email, password);
            if (result?.challengeName === 'NEW_PASSWORD_REQUIRED') {
                setChallenge({ session: result.session, email: result.email });
            } else {
                router.push('/');
            }
        } catch {
            setPasswordError('Incorrect email or password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleSetPassword() {
        if (!newPassword) {
            setNewPasswordError('Please enter a new password');
            return;
        }
        if (
            newPassword.length < 8 ||
            !/[A-Z]/.test(newPassword) ||
            !/[a-z]/.test(newPassword) ||
            !/[0-9]/.test(newPassword)
        ) {
            setNewPasswordError('Password must be at least 8 characters and include uppercase, lowercase, and a number');
            return;
        }
        setNewPasswordError('');
        setIsLoading(true);
        try {
            await setPassword(challenge!.email, challenge!.session, newPassword);
            router.push('/');
        } catch {
            setNewPasswordError('Failed to set password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    if (challenge) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4">
            <div className="flex flex-col items-center text-center w-80">
                <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-3">Set Password</h1>
                <p className="![font-family:var(--font-body)] !text-[14px] !mb-6 text-gray-600">
                    Welcome! Please set a permanent password to continue.
                </p>
                <div className="flex flex-col gap-4 w-full !mb-10">
                    <TextInputField
                        label="New Password *"
                        placeholder="Enter new password"
                        errorMessage={newPasswordError}
                        isError={!!newPasswordError}
                        value={newPassword}
                        onChange={(value) => setNewPassword(value)}
                    />
                </div>
                <Button
                    className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5"
                    onClick={handleSetPassword}
                    loading={isLoading}
                >
                    Set Password
                </Button>
            </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center text-center w-80">
            <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">Login</h1>
            <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold !mb-6">BRANCH Accounting Platform</h5>
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
