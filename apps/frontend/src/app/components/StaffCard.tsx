'use client'
import React from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { PiUserCircleThin } from "react-icons/pi";
import { MdOutlineMail } from "react-icons/md";


interface StaffCardProps {
    image?: string;
    name: string;
    title?: string;
    email: string;
  }


export default function StaffCard({
    image,
    name,
    title,
    email
  }: StaffCardProps) {
    const [imgError, setImgError] = useState(false);

    return (
        <div data-testid="staff-card" className="relative !w-full !flex flex-row items-center !p-6 !gap-6 overflow-hidden !border-1 !border-[var(--color-black-300)] !border-solid rounded-lg">
        <div className="w-[120px] h-[120px] shrink-0">
            {(image && !imgError) ? (
                <Image src={image} alt="Staff" width={120} height={120} className="object-cover w-full h-full rounded-full" onError={() => setImgError(true)}/>
            ) : (
                <div data-testid="staff-placeholder" className="rounded-full w-full h-full flex items-center justify-center bg-[var(--color-primary-300)] overflow-hidden">
                    <PiUserCircleThin className="text-[var(--color-accent-dark-green)] !w-[158px] !h-[158px] shrink-0" />
                </div>
            )}
        </div>

        <div className="flex flex-col gap-4">
            <h4 className="![font-family:var(--font-body)] !text-2xl font-normal !tracking-normal !normal-case break-words leading-tight">
                {name}{title ? `, ${title}` : ''}
            </h4>
            <div className="flex flex-row items-center gap-2">
                <MdOutlineMail className="text-black text-lg" size={24} />
                <a
                    href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="!text-[var(--color-accent-dark-green)] !font-bold !underline"
                >
                    {email}
                </a>
            </div>
        </div>
    </div>
    )
}
