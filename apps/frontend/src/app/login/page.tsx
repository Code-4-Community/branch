'use client';

import React, { useState } from 'react';
import TextInputField from '../components/TextInputField';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
            await login(email, password);
            router.push('/');
        } catch {
            setPasswordError('Incorrect email or password. Please try again.');
        } finally {
            setIsLoading(false);
        }
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
                    onChange={(value) => setPassword(value)}
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
