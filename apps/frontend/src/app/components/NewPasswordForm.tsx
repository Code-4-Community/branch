'use client';

import React from 'react';
import TextInputField from './TextInputField';
import { Button } from '@chakra-ui/react';

export default function NewPasswordForm() {
    return (
        <div className="flex flex-col items-center text-center w-80">
            <h1 className="![font-family:var(--font-heading)] !text-[36px] !font-semibold !mb-6">Reset Password</h1>
            <div className="flex flex-col gap-4 w-full !mb-10">
                <TextInputField label="New Password *" placeholder="Enter new password" errorMessage="Password is not valid"/>
                <TextInputField label="Confirm Password *" placeholder="Retype password" errorMessage="Password does not match"/>
            </div>
            {/* TODO: form validation*/}
            <Button className="![font-family:var(--font-body)] !rounded !bg-core-green !text-core-white w-full !px-4 !py-1.5 !mb-10">
                Reset Password
            </Button>
        </div>
    );
}