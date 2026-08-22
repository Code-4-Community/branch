'use client';
import React from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { PiUserCircleThin } from 'react-icons/pi';
import { MdOutlineMail } from 'react-icons/md';
import RowDeleteButton from './RowDeleteButton';

interface StaffCardProps {
  image?: string;
  name: string;
  title?: string;
  email: string;
  /**
   * Sizing for the project page's narrow staff column, where the roomier
   * default card leaves no width for the name and email.
   */
  compact?: boolean;
  /** Shows a trash affordance in the card's top-right corner. */
  onDelete?: () => void;
  /** Accessible name for that button; defaults to "Delete <name>". */
  deleteLabel?: string;
}

export default function StaffCard({
  image,
  name,
  title,
  email,
  compact = false,
  onDelete,
  deleteLabel,
}: StaffCardProps) {
  const [imgError, setImgError] = useState(false);
  const avatarSize = compact ? 96 : 120;

  return (
    <div
      data-testid="staff-card"
      className={`relative !w-full !flex flex-row items-center overflow-hidden !border-1 !border-[var(--color-black-300)] !border-solid ${
        compact
          ? 'rounded-[4px] !px-4 !py-[18px] !gap-[11px]'
          : 'rounded-lg !p-6 !gap-6'
      }`}
    >
      <div
        className="shrink-0"
        style={{ width: avatarSize, height: avatarSize }}
      >
        {image && !imgError ? (
          <Image
            src={image}
            alt="Staff"
            width={avatarSize}
            height={avatarSize}
            className="object-cover w-full h-full rounded-full"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            data-testid="staff-placeholder"
            className="rounded-full w-full h-full flex items-center justify-center bg-[var(--color-primary-300)] overflow-hidden"
          >
            <PiUserCircleThin
              className="text-[var(--color-accent-dark-green)] shrink-0"
              style={{ width: avatarSize * 1.32, height: avatarSize * 1.32 }}
            />
          </div>
        )}
      </div>

      <div
        className={`flex min-w-0 flex-col ${
          compact ? 'self-stretch justify-between' : 'gap-4'
        }`}
      >
        <h4
          className={`![font-family:var(--font-body)] font-normal !tracking-normal !normal-case break-words leading-tight ${
            compact ? '!text-xl' : '!text-2xl'
          }`}
        >
          {name}
          {title ? `, ${title}` : ''}
        </h4>
        <div className="flex min-w-0 flex-row items-center gap-2">
          <MdOutlineMail className="shrink-0 text-black text-lg" size={24} />
          <a
            href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
              email,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`!text-primary-800 !font-bold !underline truncate ${
              compact ? '!text-sm' : ''
            }`}
          >
            {email}
          </a>
        </div>
      </div>

      {onDelete && (
        <div className="absolute right-2 top-2">
          <RowDeleteButton
            label={deleteLabel ?? `Delete ${name}`}
            onClick={onDelete}
          />
        </div>
      )}
    </div>
  );
}
