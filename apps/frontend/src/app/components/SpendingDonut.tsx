'use client';

/**
 * The funding donut on the project page.
 *
 * Hand-rolled SVG: no charting library is a dependency of this app, and a
 * single-series ring does not justify adding one.
 */

interface SpendingDonutProps {
  /** 0–100. Values outside the range are clamped so a project that has
   *  overspent still renders a full ring rather than wrapping past 12 o'clock. */
  percentage: number;
  /** Rendered in the middle of the ring. */
  label?: string;
}

// Figma draws a 276px ring with a 27.6px band. Kept as a viewBox so the chart
// scales with its container instead of pinning the layout to 276px.
const SIZE = 276;
const STROKE = 27.6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function SpendingDonut({
  percentage,
  label = 'spent',
}: SpendingDonutProps) {
  const clamped = Math.min(
    100,
    Math.max(0, Number.isFinite(percentage) ? percentage : 0),
  );
  const rounded = Math.round(clamped);

  return (
    <div className="relative w-full max-w-[276px] shrink-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${rounded}% of the budget ${label}`}
      >
        {/* -90deg so the arc starts at 12 o'clock rather than 3 o'clock. */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-black-200)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-primary-800)"
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
          />
        </g>
      </svg>

      {/* Centred in the ring, with the two labels sharing a baseline inside —
          the design sets the percentage in heading type and "spent" in body
          type, sitting on the same line. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex items-baseline gap-1.5">
          <h3 className="!text-core-green">{rounded}%</h3>
          <p className="!text-xl !text-core-green">{label}</p>
        </div>
      </div>
    </div>
  );
}
