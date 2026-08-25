'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSearch, LuX } from 'react-icons/lu';
import {
  DEFAULT_PROJECT_ROLE,
  PROJECT_ROLES,
  type AssignableStaff,
  type MemberAssignment,
  type ProjectRole,
} from '@/types';
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover';
import DropdownSelector from './DropdownSelector';
import LoadingState from './LoadingState';

const LISTBOX_MAX_HEIGHT = 220;

const ROLE_OPTIONS: string[] = [...PROJECT_ROLES];

interface StaffPickerProps {
  label: string;
  options: AssignableStaff[];
  /** Selected staff and the role each holds, in the order they were added. */
  value: MemberAssignment[];
  onChange: (value: MemberAssignment[]) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  isError?: boolean;
  errorMessage?: string;
  isLoading?: boolean;
}

/**
 * Search-and-select list of staff, rendering the chosen people as removable
 * rows beneath the field, each with the project role they will hold.
 *
 * Filtering happens client-side against the full roster: the staff list is
 * organisation-sized (tens, not thousands), so a request per keystroke would
 * cost more than it saves.
 */
export default function StaffPicker({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search by name...',
  required = false,
  disabled = false,
  isError = false,
  errorMessage,
  isLoading = false,
}: StaffPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const {
    anchorRef: fieldRef,
    popoverRef: listboxRef,
    boundaryRef: containerRef,
    position,
  } = useAnchoredPopover<HTMLDivElement, HTMLDivElement, HTMLDivElement>({
    open,
    onDismiss: () => setOpen(false),
    maxHeight: LISTBOX_MAX_HEIGHT,
  });

  const byId = useMemo(
    () => new Map(options.map((option) => [option.user_id, option])),
    [options],
  );

  const selected = useMemo(
    () =>
      value
        .map((assignment) => {
          const person = byId.get(assignment.user_id);
          return person ? { person, role: assignment.role } : null;
        })
        .filter((entry) => entry !== null),
    [value, byId],
  );

  const selectedIds = useMemo(
    () => new Set(value.map((assignment) => assignment.user_id)),
    [value],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selectedIds.has(option.user_id)) return false;
      if (!needle) return true;
      return (
        option.name.toLowerCase().includes(needle) ||
        option.email.toLowerCase().includes(needle)
      );
    });
  }, [options, query, selectedIds]);

  const add = (id: number) => {
    onChange([...value, { user_id: id, role: DEFAULT_PROJECT_ROLE }]);
    setQuery('');
  };

  const remove = (id: number) =>
    onChange(value.filter((assignment) => assignment.user_id !== id));

  const setRole = (id: number, role: ProjectRole) =>
    onChange(
      value.map((assignment) =>
        assignment.user_id === id ? { ...assignment, role } : assignment,
      ),
    );

  const labelClass = isError ? '!text-error-red' : '!text-core-black';
  const boxClass = isError ? '!border-error-red' : '!border-black-400';

  return (
    <div className="flex w-full flex-col !gap-2" ref={containerRef}>
      <label className={`!font-body !text-base !font-normal !leading-[21px] ${labelClass}`}>
        {label}
        {required && '*'}
      </label>

      <div className="relative">
        <div
          ref={fieldRef}
          className={`flex h-10 w-full items-center !gap-2 rounded-[4px] !border-[1px] !border-solid bg-core-white !px-4 ${boxClass}`}
        >
          <LuSearch
            size={18}
            aria-hidden
            className={
              isError ? 'shrink-0 text-error-red' : 'shrink-0 text-core-black'
            }
          />
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            aria-label={label}
            className={`h-full w-full bg-transparent !font-body !text-base outline-none disabled:cursor-not-allowed ${
              isError
                ? '!font-bold !text-error-red placeholder:!font-bold placeholder:!text-error-red'
                : '!text-core-black placeholder:!text-black-700'
            }`}
          />
        </div>

        {open &&
          !disabled &&
          position &&
          createPortal(
            <div
              role="listbox"
              aria-label={label}
              ref={listboxRef}
              style={position}
              className="fixed overflow-y-auto rounded-[4px] !border-[1px] !border-solid !border-black-500 bg-core-white shadow-lg"
            >
              {isLoading && (
                <LoadingState
                  label="Loading staff…"
                  size="sm"
                  variant="inline"
                />
              )}
              {!isLoading && matches.length === 0 && (
                <p className="!px-3 !py-2 !text-black-700">
                  {query.trim()
                    ? 'No matching staff'
                    : 'Everyone is already assigned'}
                </p>
              )}
              {matches.map((option) => (
                <button
                  key={option.user_id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => add(option.user_id)}
                  className="flex min-h-[37px] w-full cursor-pointer flex-col items-start justify-center !px-3 !py-2 text-left !text-base !text-black-700 hover:!bg-core-green hover:!font-bold hover:!text-core-white"
                >
                  {option.name}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-col !gap-2" aria-label={`Selected ${label}`}>
          {selected.map(({ person, role }) => (
            <li
              key={person.user_id}
              className="flex items-center !gap-3 rounded-[4px] bg-black-300 !px-3 !py-2"
            >
              <div className="min-w-0 flex-1">
                <small className="block truncate !font-bold !text-core-black">
                  {person.name}
                </small>
                <small className="block truncate !text-black-700">
                  {person.email}
                </small>
              </div>

              <div className="w-[130px] shrink-0">
                <DropdownSelector
                  options={ROLE_OPTIONS}
                  value={role}
                  disabled={disabled}
                  ariaLabel={`Role for ${person.name}`}
                  onChange={(next) =>
                    setRole(person.user_id, next as ProjectRole)
                  }
                />
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(person.user_id)}
                aria-label={`Remove ${person.name}`}
                className="flex shrink-0 cursor-pointer items-center justify-center text-core-black disabled:cursor-not-allowed"
              >
                <LuX size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isError && errorMessage && (
        <p className="!text-sm !font-bold !italic !text-error-red">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
