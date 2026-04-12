'use client';

import React from 'react';
import { Button } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';


export default function ResetPasswordConfirmation() {
    const router = useRouter();

    return (
        <div className="flex flex-col items-center text-center w-90">
            <div className="flex flex-col items-start gap-6">
                <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold">Password Changed</h1>
                <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center !text-core-black !mb-6">Your password has been successfully changed!</h5>
            </div>
            {/*TODO: figure out how to connect the button to login page */}
            <Button className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10"
                    onClick={() => router.push('/login')}>
                Back to login
            </Button>
        </div>
    );
}