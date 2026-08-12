'use client';

import Spinner, { type SpinnerSize } from './Spinner';

interface LoadingStateProps {
  /**
   * Announced to screen readers, and shown as text when `showLabel` is set.
   * Say what is loading — several of these can be on screen at once.
   */
  label?: string;
  /** Renders the label under the spinner. Off by default: the spinner says it. */
  showLabel?: boolean;
  size?: SpinnerSize;
  /**
   * `section` reserves vertical space so a page region does not collapse and
   * then jolt when the data lands; `inline` hugs its content for tight spots
   * such as a dropdown menu or a dialog body.
   */
  variant?: 'section' | 'inline';
  className?: string;
}

/**
 * The standard placeholder for a region whose content has not arrived yet:
 * a centred spinner in place of the old "Loading…" paragraphs.
 *
 * For tables prefer `TableSkeletonRows`, which keeps the header and column
 * widths on screen instead of blanking the whole grid.
 */
export default function LoadingState({
  label = 'Loading…',
  showLabel = false,
  size = 'md',
  variant = 'section',
  className = '',
}: LoadingStateProps) {
  const spacing = variant === 'section' ? 'min-h-[240px] !py-10' : '!py-3';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={showLabel ? undefined : label}
      className={`flex w-full flex-col items-center justify-center !gap-3 text-core-green ${spacing} ${className}`}
    >
      <Spinner size={size} />
      {showLabel && <p className="!text-black-700">{label}</p>}
    </div>
  );
}
