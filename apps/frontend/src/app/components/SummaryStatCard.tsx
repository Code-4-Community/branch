import React from 'react';

interface SummaryStatCardProps {
  label: string;
  value: string;
  caption: string;
}

/** One of the four figures across the top of the admin dashboard. */
export default function SummaryStatCard({
  label,
  value,
  caption,
}: SummaryStatCardProps) {
  return (
    // `!` on both border width and colour — Chakra's reset outranks plain
    // Tailwind border utilities.
    <div className="flex min-w-0 flex-col !gap-2 rounded !border-[1px] border-solid !border-primary-800 bg-core-white !px-6 !py-4">
      <p className="text-core-black">{label}</p>
      {/* Not an <h3> — the headings on this page mark its sections. Wraps
          instead of truncating: a fluid grid can't guarantee width. */}
      <p className="[word-break:break-word] ![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">
        {value}
      </p>
      <small className="!font-bold text-primary-600">{caption}</small>
    </div>
  );
}
