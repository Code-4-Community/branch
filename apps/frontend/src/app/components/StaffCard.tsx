'use client'
import React from 'react';
import Image from 'next/image';
import { useState } from 'react';


interface StaffCardProps {
    image?: string;
    name: string;
    title: string;
  }


export default function StaffCard({
    image,
    name,
    title
  }: StaffCardProps) {
    const [imgError, setImgError] = useState(false);

    return (
        <div className="!w-[90px] h-100 flex flex-col items-center !pt-3 !gap-1 overflow-hidden">
            {(image && !imgError) ? (
                <Image src={image} alt="Staff" width={90} height={105} className="object-cover ![aspect-ratio:44/51] w-full" onError={() => setImgError(true)}/>
            ) : (
                <div className="!w-[90px] ![aspect-ratio:44/51] bg-accent-dark-green"></div>
            )}
            <div className="flex flex-col items-center gap-1 !w-[90px]">
                <p className="![font-family:var(--font-body)] !text-[length:var(--font-size-body)] !font-normal break-words w-full text-center">{name}</p> 
                <p className="![font-family:var(--font-family-body)] !text-[length:var(--font-size-callout)] !font-bold break-words w-full text-center">{title}</p>
            </div>
        </div>
    )
}
