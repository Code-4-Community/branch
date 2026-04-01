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
        <div className="!w-fit !h-fit !flex flex-col items-center !p-3 !gap-1 overflow-hidden !border-1 !border-[var(--color-black-300)] !border-solid">
            {(image && !imgError) ? (
                <Image src={image} alt="Staff" width={90} height={105} className="object-cover ![aspect-ratio:44/51] w-full" onError={() => setImgError(true)}/>
            ) : (
                <div data-testid="staff-placeholder" className="!w-fit !h-fit !p-1 bg-[var(--color-primary-300)]">
                    <PiUserCircleThin size={90} className="text-[var(--color-accent-dark-green)]" />
                </div>
                
            )}
            <div className="flex flex-col items-center gap-1 !w-[90px]">
                <p className="![font-family:var(--font-body)] !text-[length:var(--font-size-callout)] !font-bold break-words w-full text-center">{name}</p> 
            </div>
        </div>
    )
}
