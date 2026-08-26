'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { PiUserCircleThin } from 'react-icons/pi';

interface ProfilePhotoProps {
  /** Presigned URL from the API, or an object URL while a new file is staged. */
  src?: string | null;
  name: string;
  /** Square edge in pixels; the design uses 219 on the page and 225 in the modal. */
  size: number;
}

/**
 * The profile photo, falling back to the placeholder glyph when there is no
 * photo or the URL will not load. The presigned src expires, so a stale page
 * hits `onError` and shows the placeholder rather than a broken image.
 */
export default function ProfilePhoto({ src, name, size }: ProfilePhotoProps) {
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt: without this, one expired URL would
  // keep the placeholder pinned even after a successful re-upload.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] !border-[1px] !border-solid !border-black-300 bg-primary-300"
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt={name ? `${name}'s profile photo` : 'Profile photo'}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          unoptimized
        />
      ) : (
        <PiUserCircleThin
          data-testid="profile-photo-placeholder"
          aria-hidden
          className="shrink-0 text-accent-dark-green"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
}
