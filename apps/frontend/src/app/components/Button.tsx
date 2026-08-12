'use client';

import React from 'react';
import Spinner from './Spinner';

/**
 * The three button treatments the designs use, named for intent rather than
 * colour so a token change does not require renaming call sites.
 *
 * - `primary`   filled green — the one affirmative action on a screen
 * - `secondary` outlined — cancel/dismiss beside a primary
 * - `ghost`     text only — inline navigation such as "View All"
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

// Every colour utility here is `!`-prefixed: Chakra's reset styles `button`
// with `background: transparent` and its own border colour, and it outranks
// unprefixed Tailwind utilities — without this the primary button renders as
// bare text and the secondary loses its outline.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    '!bg-core-green !text-core-white hover:!bg-accent-dark-green disabled:!bg-primary-500',
  secondary:
    '!border-[1px] !border-solid !border-black-500 !bg-transparent !text-core-black hover:!bg-black-100 disabled:!text-black-500',
  ghost: '!bg-transparent !text-core-black hover:!bg-black-100 disabled:!text-black-500',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Rendered at 24px before the label, matching the design's icon slot. */
  icon?: React.ReactNode;
  /** Moves the icon after the label, e.g. a trailing chevron. */
  iconPosition?: 'start' | 'end';
  /** Swaps the icon slot for a spinner and blocks further clicks. */
  isLoading?: boolean;
  /** Label to show while loading; defaults to keeping the idle one. */
  loadingText?: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  icon,
  iconPosition = 'start',
  isLoading = false,
  loadingText,
  children,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  // The spinner takes the icon's slot so the button keeps its width, and
  // occupies it even when there is no icon so the label does not jump.
  const iconSlot =
    isLoading || icon ? (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
        {isLoading ? <Spinner size="sm" /> : icon}
      </span>
    ) : null;

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex h-10 min-w-9 shrink-0 cursor-pointer items-center justify-center gap-[9px] rounded-[4px] !px-3 !py-0.5 !font-body !text-base !font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {iconPosition === 'start' && iconSlot}
      {isLoading && loadingText !== undefined ? loadingText : children}
      {iconPosition === 'end' && iconSlot}
    </button>
  );
}
