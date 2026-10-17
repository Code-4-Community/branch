'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { STAFF_CONSOLE_PATH } from '@/lib/routes';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ImpersonationBanner() {
  const { user, stopImpersonation } = useAuth();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const impersonation = user?.impersonation;
  if (!user || !impersonation) return null;

  const full = impersonation.mode === 'full';

  const exit = async () => {
    setLeaving(true);
    try {
      await stopImpersonation();
      router.replace(STAFF_CONSOLE_PATH);
    } finally {
      setLeaving(false);
    }
  };

  // `!` on padding and colours: Chakra's reset outranks unprefixed utilities.
  return (
    <div
      role="status"
      className={`sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 !px-4 !py-2 text-sm !text-core-white ${
        full ? '!bg-error-red' : '!bg-accent-dark-green'
      }`}
    >
      <span className="min-w-0">
        Viewing as <strong>{user.name}</strong> ({user.email}) ·{' '}
        {full ? 'Full access: changes are real' : 'Read-only'} · ends{' '}
        {timeOf(impersonation.expiresAt)}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="shrink-0 rounded !border-[1px] !border-solid !border-core-white !bg-transparent !px-3 !py-1 font-semibold !text-core-white hover:!opacity-80 disabled:!opacity-60"
      >
        {leaving ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  );
}
