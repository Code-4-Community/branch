'use client';

/**
 * The app's one spinner. Every "something is in flight" affordance should end
 * up here rather than rolling its own div or borrowing Chakra's, so the size
 * ramp and timing stay consistent.
 *
 * Colour comes from `currentColor` — set a text colour on the parent (or via
 * `className`) to put a spinner on a dark surface.
 */
export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

/** Ring thickness scales with the diameter, otherwise small sizes read as blobs. */
const SIZES: Record<SpinnerSize, { box: number; border: number }> = {
  xs: { box: 14, border: 2 },
  sm: { box: 20, border: 2 },
  md: { box: 32, border: 3 },
  lg: { box: 40, border: 4 },
};

interface SpinnerProps {
  size?: SpinnerSize;
  /**
   * Accessible name. Provide it only when the spinner is the sole indication
   * that something is loading — when it sits inside an element that is already
   * `role="status"` (LoadingState, FullPageSpinner), leave it off so screen
   * readers announce the region once instead of twice.
   */
  label?: string;
  className?: string;
}

export default function Spinner({ size = 'md', label, className = '' }: SpinnerProps) {
  const { box, border } = SIZES[size];

  const ring = (
    <span
      aria-hidden
      className={`branch-spinner ${label ? '' : className}`}
      style={{ width: box, height: box, borderWidth: border }}
    />
  );

  if (!label) return ring;

  return (
    <span role="status" aria-live="polite" aria-label={label} className={`inline-flex ${className}`}>
      {ring}
    </span>
  );
}
