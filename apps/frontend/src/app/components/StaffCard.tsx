'use client'
import React from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { PiUserCircleThin } from "react-icons/pi";


interface StaffCardProps {
    image?: string;
    name: string;
  }


export default function StaffCard({
    image,
    name
  }: StaffCardProps) {
    const [imgError, setImgError] = useState(false);

    return (
        <div className="relative !w-full !flex flex-col items-center !p-3 !gap-1 overflow-hidden !border-1 !border-[var(--color-black-300)] !border-solid">
            <div className="w-full aspect-square">
                {(image && !imgError) ? (
                    <Image src={image} alt="Staff" width={120} height={120} className="object-cover w-full h-full" onError={() => setImgError(true)}/>
                ) : (
                    <div data-testid="staff-placeholder" className="w-full h-full flex items-center justify-center bg-[var(--color-primary-300)]">
                        <PiUserCircleThin size="100%" className="text-[var(--color-accent-dark-green)]" />
                    </div>
                )}
            </div>
            <p className="![font-family:var(--font-body)] !text-[length:var(--font-size-callout)] !font-bold break-words w-full text-center !pt-1 !pb-2">{name}</p> 
        </div>
    )
}
