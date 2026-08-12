'use client';

import { useEffect, useRef, useState } from 'react';
import { CiFilter } from 'react-icons/ci';

export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

interface ExpenseFilterMenuProps {
  groups: FilterGroup[];
}

const PANEL_BORDER = '1px solid var(--color-black-200)';

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        display: 'flex',
        height: '20px',
        width: '20px',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        border: `1px solid ${checked ? 'var(--color-core-green)' : 'var(--color-black-300)'}`,
        backgroundColor: checked ? 'var(--color-core-green)' : 'var(--color-core-white)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: checked ? 1 : 0 }}>
        <path d="M2 6l3 3 5-5" stroke="var(--color-core-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function ExpenseFilterMenu({ groups }: ExpenseFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpandedKey(null);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const expanded = groups.find((g) => g.key === expandedKey);

  function toggleOption(group: FilterGroup, value: string) {
    const next = group.selected.includes(value)
      ? group.selected.filter((v) => v !== value)
      : [...group.selected, value];
    group.onChange(next);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setExpandedKey(null);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          height: '40px',
          padding: '2px 12px',
          borderRadius: '4px',
          border: '1px solid var(--color-black-500)',
          backgroundColor: 'var(--color-core-white)',
          color: 'var(--color-core-black)',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: '16px',
          cursor: 'pointer',
        }}
      >
        <CiFilter size={20} />
        Filter By
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', marginTop: '2px' }}>
          <div
            style={{
              border: PANEL_BORDER,
              borderRadius: '4px',
              backgroundColor: 'var(--color-core-white)',
              minWidth: '115px',
            }}
          >
            {groups.map((group, index) => {
              const isExpanded = group.key === expandedKey;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : group.key)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 12px',
                    borderTop: index === 0 ? 'none' : PANEL_BORDER,
                    backgroundColor: 'transparent',
                    color: 'var(--color-black-700)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '16px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.label}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 5.23a.75.75 0 011.06-.02l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 11-1.04-1.08L11.168 10 7.23 6.29a.75.75 0 01-.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              );
            })}
          </div>

          {expanded && (
            <div
              style={{
                border: PANEL_BORDER,
                borderRadius: '4px',
                backgroundColor: 'var(--color-core-white)',
                marginLeft: '4px',
                minWidth: '138px',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {expanded.options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleOption(expanded, option.value)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderTop: index === 0 ? 'none' : PANEL_BORDER,
                    backgroundColor: 'transparent',
                    color: 'var(--color-black-700)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '16px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Checkbox checked={expanded.selected.includes(option.value)} />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
