'use client';

import React, { useId, useState } from 'react';

/**
 * Hover/focus tooltip for explaining a control the user cannot use.
 *
 * Hand-rolled rather than pulled from Chakra because it has to wrap *disabled*
 * elements: a disabled button fires no pointer events in any browser, so the
 * listeners live on the wrapper span instead. That is also why the wrapper is
 * focusable when it holds a disabled control — otherwise a keyboard user would
 * have no way to learn why the action is unavailable.
 */
export default function Tooltip({
  label,
  children,
  wrapsDisabledControl = false,
}: {
  /** Absent means "nothing to explain" — the child renders bare. */
  label?: string;
  children: React.ReactNode;
  wrapsDisabledControl?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!label) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      // The label is the accessible description of whatever it wraps, so a
      // screen reader hears the reason with the control rather than after it.
      aria-describedby={open ? id : undefined}
      tabIndex={wrapsDisabledControl ? 0 : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-[4px] bg-core-black px-2 py-1 !text-xs !font-normal !text-core-white shadow-lg"
        >
          {label}
        </span>
      )}
    </span>
  );
}
