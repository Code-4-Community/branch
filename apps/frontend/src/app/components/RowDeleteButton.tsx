'use client';

import React from 'react';
import { LuTrash2 } from 'react-icons/lu';

interface RowDeleteButtonProps {
  /** Names the row, so screen readers get "Delete expense #000012". */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The trash affordance in a table row. Separate from `Button` because a row
 * action is icon-only and must not inherit the 40px form-button box.
 *
 * Stops propagation: every list table that has row actions also has an
 * `onRowClick` that opens the record, and deleting should not also navigate.
 */
export default function RowDeleteButton({
  label,
  onClick,
  disabled = false,
}: RowDeleteButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[4px] !bg-transparent !text-black-600 transition-colors hover:!bg-black-100 hover:!text-error-red disabled:cursor-not-allowed disabled:!text-black-300"
    >
      <LuTrash2 aria-hidden className="h-4 w-4" />
    </button>
  );
}
