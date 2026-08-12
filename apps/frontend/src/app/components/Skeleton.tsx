'use client';

import type { CSSProperties } from 'react';

interface SkeletonProps {
  /** Any CSS length; percentages let a bar track its cell. */
  width?: string | number;
  height?: string | number;
  /** Offsets the shimmer so a stack of skeletons animates as a wave. */
  delayMs?: number;
  className?: string;
}

/**
 * A shimmering placeholder bar. Purely decorative — it is `aria-hidden`, so
 * whatever renders it owns the `role="status"` announcement.
 */
export default function Skeleton({
  width = '100%',
  height = 14,
  delayMs = 0,
  className = '',
}: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`branch-skeleton block ${className}`}
      style={
        {
          width,
          height,
          '--branch-skeleton-delay': `${delayMs}ms`,
        } as CSSProperties
      }
    />
  );
}
