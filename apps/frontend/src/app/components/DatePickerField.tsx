'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCalendar, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { formatDateOrdinal, parseApiDate, toApiDate } from '@/lib/format';
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover';

interface DatePickerFieldProps {
  label: string;
  /** `YYYY-MM-DD`, or `''` for no selection. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  isError?: boolean;
  errorMessage?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const CALENDAR_WIDTH = 264;
/** Tall enough for the header, weekday row, six week rows and the clear button. */
const CALENDAR_HEIGHT = 320;

/** The 42 cells of a month grid, including the leading/trailing days that pad it. */
function buildCalendarGrid(month: Date): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, inMonth: date.getMonth() === month.getMonth() };
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Date input with a calendar popover.
 *
 * Hand-rolled rather than a native `<input type="date">`: the design specifies
 * an ordinal display format ("May 15th, 2025") and a styled grid, neither of
 * which a native picker allows. No date library is a dependency of this app.
 */
export default function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  required = false,
  disabled = false,
  isError = false,
  errorMessage,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const {
    anchorRef: triggerRef,
    popoverRef,
    boundaryRef: containerRef,
    position,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement, HTMLDivElement>({
    open,
    onDismiss: () => setOpen(false),
    maxHeight: CALENDAR_HEIGHT,
    width: CALENDAR_WIDTH,
  });

  const selected = useMemo(() => parseApiDate(value), [value]);
  const [viewMonth, setViewMonth] = useState<Date>(
    () => selected ?? new Date(),
  );

  // Re-centre the grid when the value changes from outside (e.g. opening the
  // edit modal on a project that already has dates).
  useEffect(() => {
    if (selected)
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [selected]);

  const grid = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);
  const today = new Date();

  const tone = isError ? 'error' : 'default';
  const labelClass = tone === 'error' ? '!text-error-red' : '!text-core-black';
  const boxClass =
    tone === 'error'
      ? '!border-error-red !text-error-red !font-bold'
      : '!border-black-400 !text-core-black';
  const valueClass = value
    ? tone === 'error'
      ? '!text-error-red'
      : '!text-core-black'
    : tone === 'error'
    ? '!text-error-red !font-bold'
    : '!text-black-700';

  return (
    <div className="flex w-full flex-col !gap-2" ref={containerRef}>
      <label className={`!font-body !text-base !font-normal !leading-[21px] ${labelClass}`}>
        {label}
        {required && '*'}
      </label>

      <div className="relative">
        <button
          type="button"
          ref={triggerRef}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex h-10 w-full cursor-pointer items-center justify-between rounded-[4px] !border-[1px] !border-solid bg-core-white !pl-4 !pr-px !text-left disabled:cursor-not-allowed disabled:opacity-60 ${boxClass}`}
        >
          <span className={`truncate !font-body !text-base ${valueClass}`}>
            {value ? formatDateOrdinal(value) : placeholder}
          </span>
          <span
            className={`flex h-[38px] w-[30px] shrink-0 items-center justify-center rounded-r-[3px] ${
              tone === 'error'
                ? 'text-error-red'
                : 'bg-black-100 text-core-black'
            }`}
          >
            <LuCalendar size={20} aria-hidden />
          </span>
        </button>

        {open &&
          position &&
          createPortal(
            <div
              role="dialog"
              aria-label={`Choose ${label}`}
              ref={popoverRef}
              style={position}
              className="fixed overflow-y-auto rounded-[4px] !border-[1px] !border-solid !border-black-500 bg-core-white !p-2.5 shadow-lg"
            >
              <div className="flex items-center justify-between !gap-2">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setViewMonth(
                      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                    )
                  }
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg !border-[1px] !border-solid !border-black-200 bg-core-white text-core-black shadow-sm hover:bg-black-100"
                >
                  <LuChevronLeft size={15} aria-hidden />
                </button>
                <h5>
                  {viewMonth.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </h5>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setViewMonth(
                      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                    )
                  }
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg !border-[1px] !border-solid !border-black-200 bg-core-white text-core-black shadow-sm hover:bg-black-100"
                >
                  <LuChevronRight size={15} aria-hidden />
                </button>
              </div>

              <div className="!mt-4 grid grid-cols-7">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="flex h-8 w-8 items-center justify-center !font-body !text-sm !font-bold text-black-500"
                  >
                    {day}
                  </div>
                ))}

                {grid.map(({ date, inMonth }) => {
                  const isSelected = selected
                    ? isSameDay(date, selected)
                    : false;
                  const isToday = isSameDay(date, today);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      aria-current={isSelected ? 'date' : undefined}
                      onClick={() => {
                        onChange(toApiDate(date));
                        setOpen(false);
                      }}
                      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-[5px] !font-body !text-base text-black-800 hover:bg-black-100 ${
                        inMonth ? '' : 'opacity-50'
                      } ${
                        isSelected
                          ? '!bg-core-green !font-bold !text-core-white'
                          : isToday
                          ? 'bg-black-100'
                          : ''
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="!mt-2 w-full cursor-pointer rounded-[4px] !py-1.5 !font-body !text-sm !font-bold text-core-green hover:bg-black-100"
                >
                  Clear date
                </button>
              )}
            </div>,
            document.body,
          )}
      </div>

      {isError && errorMessage && (
        <p className="!text-sm !font-bold !italic !text-error-red">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
