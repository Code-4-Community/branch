'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@chakra-ui/react';

export default function ResetLinkSet() {
    return (
        <div className="flex flex-col shrink-0 items-start gap-[30px]">
            <div className="flex flex-col items-start gap-6">
                <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-bold !ml-5">
                    Reset Link Sent!
                </h1>
                <h5 className="![font-family:var(--font-body)] !text-[16px] !font-bold text-center w-[326px] !mx-[7px] !text-core-black">
                    We sent a reset link to name@gmail.com with a link to reset your password.
                </h5>
            </div>
            <div className="flex flex-col items-start gap-9">
                {/* TODO: connect up to backend */}
                <Button className="![font-family:var(--font-body)] !text-[16px] !font-bold !bg-core-green !text-core-white !py-3 !px-[90px] !rounded !border-0">
                    Request reset link again
                </Button>
                {/* TODO: Update href when login page route is finalized */}
                <Link href="#" className="![font-family:var(--font-body)] !text-[16px] !font-bold !text-core-green !py-3 !px-[127px]">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
