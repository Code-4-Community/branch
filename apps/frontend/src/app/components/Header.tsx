'use client';

import React from 'react';
import Image from "next/image";
import { assetPath } from "@/lib/asset";
import { useAuth } from "@/context/AuthContext";

interface HeaderProps {
  text?: string;
  icon?: React.ReactNode;
}

function initialsOf(name: string | undefined | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const Header: React.FC<HeaderProps> = ({
  text = "BRANCH Accounting Platform",
  icon
}) => {
  // Identity comes from GET /auth/me, not from decoding a token — isAdmin in
  // particular exists only in Postgres and is not a JWT claim.
  const { user, isAdmin } = useAuth();

  // Padding utilities need the ! prefix here: Chakra's reset zeroes padding on
  // bare elements and outranks unprefixed Tailwind utilities.
  return (
    <header
      className="flex w-full h-12 items-center justify-between gap-3 border-b border-gray-200 bg-white !px-4 sm:!px-8"
      style={{paddingTop: 20, paddingBottom: 12}}
    >
      {/* Dynamic Text Section */}
      <h5 className="min-w-0 truncate text-core-black">
        {text}
      </h5>

      {/* Flexible Icon Section */}
      <div className="flex min-w-0 items-center gap-3">
        {icon ?? (user ? (
          <>
            {/* Hidden on a phone: the name and email are the first things that
                can go when the rail already claims most of the width. */}
            <div className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
              <span className="max-w-[22ch] truncate text-sm font-semibold text-core-black">{user.name}</span>
              <span className="max-w-[26ch] truncate text-xs text-gray-500">{user.email}</span>
            </div>
            {isAdmin && (
              <span
                className="hidden shrink-0 rounded-full !px-2 !py-0.5 text-xs font-semibold sm:inline"
                style={{ backgroundColor: '#e6f0e8', color: '#2E6038' }}
              >
                Admin
              </span>
            )}
            <div
              className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#2E6038' }}
              aria-hidden="true"
            >
              {initialsOf(user.name)}
            </div>
          </>
        ) : (
          // Signed out: keep the neutral placeholder rather than implying a user.
          <div className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center">
            <Image src={assetPath("/profile-icon.svg")} alt="Profile Icon" width={24} height={24} />
          </div>
        ))}
      </div>
    </header>
  );
};

export default Header;
