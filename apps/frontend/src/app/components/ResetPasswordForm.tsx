'use client';

import React from 'react';
import TextInputField from './TextInputField';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';

export default function ResetPasswordForm() {
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
                <TextInputField label="Email *" placeholder="Placeholder" />
                {/* TODO: connect up to backend */}
                <Button className="![font-family:var(--font-body)] !text-[16px] !font-bold !bg-core-green !text-core-white !py-3 !px-[110px] !rounded !border-0">
                    Request reset link
                </Button>
                {/* TODO: Update href when login page route is finalized */}
                <Link href="#" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3 !px-[127px]">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
