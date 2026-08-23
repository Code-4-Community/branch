'use client';

import { EXPENDITURE_STATUS_LABELS, type ExpenditureStatus } from '@/types';

// Keyed by string, not ExpenditureStatus: `denied` is a status the API writes
// and the policy treats as final, but the decision picker does not offer it, so
// it is absent from EXPENDITURE_STATUSES while still arriving on rows.
const STATUS_COLORS: Record<string, string> = {
  approved: 'var(--color-accent-light-green)',
  pending: 'var(--color-status-pending)',
  needs_more_info: 'var(--color-error-light-red)',
  denied: 'var(--color-error-red)',
};

const EXTRA_STATUS_LABELS: Record<string, string> = { denied: 'Denied' };

function describe(status: ExpenditureStatus) {
  return {
    color: STATUS_COLORS[status] ?? 'var(--color-black-200)',
    label:
      EXPENDITURE_STATUS_LABELS[status] ??
      EXTRA_STATUS_LABELS[status] ??
      String(status).replace(/_/g, ' '),
  };
}

interface StatusBadgeProps {
  status: ExpenditureStatus;
  /** Renders as a button when the badge is a choice, e.g. Admin Decision. */
  onClick?: () => void;
  selected?: boolean;
}

export default function StatusBadge({ status, onClick, selected }: StatusBadgeProps) {
  const { color, label } = describe(status);

  const style: React.CSSProperties = {
    backgroundColor: color,
    color: 'var(--color-core-black)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--font-size-subtitle-2)',
    // Figma draws the pill at 81x29, but the label drives the real width so
    // longer statuses cannot clip. 81px becomes the floor, not the size.
    minWidth: '81px',
    padding: '0.25rem 0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  if (!onClick) {
    return <span style={style}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        ...style,
        cursor: 'pointer',
        border: selected ? '2px solid var(--color-core-black)' : '2px solid transparent',
        opacity: selected ? 1 : 0.55,
      }}
    >
      {label}
    </button>
  );
}
