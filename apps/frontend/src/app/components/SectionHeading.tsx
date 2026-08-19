'use client';

import React from 'react';
import Link from 'next/link';
import { LuChevronRight } from 'react-icons/lu';
import Button from './Button';

interface SectionHeadingProps {
  /** Uppercased by the `h4` element style, so pass it in natural case. */
  label: string;
  icon: React.ReactNode;
  /** Renders the "View All" affordance. Omit both to hide it. */
  viewAllHref?: string;
  onViewAll?: () => void;
}

/**
 * The `LABEL (icon) ........ > View All` row that heads every panel on the
 * project page. The rule underneath is part of the heading in the design, but
 * it is left to the caller because only some sections carry one.
 */
export default function SectionHeading({
  label,
  icon,
  viewAllHref,
  onViewAll,
}: SectionHeadingProps) {
  const viewAll = (
    <>
      <LuChevronRight aria-hidden />
      View All
    </>
  );

  return (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h4 className="!text-core-black">{label}</h4>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-core-black [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
      </div>

      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="inline-flex h-10 items-center gap-[9px] rounded-[4px] !px-3 !font-body !text-base !font-bold text-core-black transition-colors hover:bg-black-100"
        >
          {viewAll}
        </Link>
      ) : onViewAll ? (
        <Button variant="ghost" onClick={onViewAll}>
          {viewAll}
        </Button>
      ) : null}
    </div>
  );
}
