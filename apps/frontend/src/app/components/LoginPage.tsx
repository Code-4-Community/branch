'use client';

import React from 'react';
import TextInputField from './TextInputField';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';

export default function LoginPage() {
    return (
        <div className="flex flex-col items-center text-center w-80">
            <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">Login</h1>
            <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold !mb-6">BRANCH Accounting Platform</h5>
            <div className="flex flex-col gap-4 w-full !mb-10">
                <TextInputField label="Email *" placeholder="Enter email address" errorMessage="Please enter a valid email address"/>
                <TextInputField label="Password *" placeholder="Enter password" errorMessage="Please enter valid password"/>
            </div>
            {/* TODO: form validation*/}
            <Button className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10">
                Login
            </Button>
            {/* TODO: Update href when forgot password page is created */}
            <Link href="#" className="!text-core-green !font-bold ![font-family:var(--font-body)] !text-[16px]">
                Forgot password?
            </Link>
        </div>
        
    );
}

