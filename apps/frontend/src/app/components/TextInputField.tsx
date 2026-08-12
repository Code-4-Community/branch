'use client';

import { useState } from 'react';
import { Field, Input, Textarea } from '@chakra-ui/react';

interface TextInputFieldProps {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isError?: boolean;
  errorMessage?: string;
  isValid?: boolean;
  /** Appends the `*` the designs use to mark mandatory fields. */
  required?: boolean;
  disabled?: boolean;
  /** Renders a `Textarea` instead of an `Input`, for free-text fields. */
  multiline?: boolean;
  rows?: number;
  /** Rendered before the value, e.g. `$` on the budget field. */
  prefix?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
}

export default function TextInputField({
  label,
  value,
  onChange,
  placeholder = '',
  isError = false,
  errorMessage,
  isValid = false,
  required = false,
  disabled = false,
  multiline = false,
  rows = 4,
  prefix,
  inputMode,
}: TextInputFieldProps) {
  const [internalValue, setInternalValue] = useState('');

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const newValue = e.target.value;
    if (!isControlled) setInternalValue(newValue);
    onChange?.(newValue);
  }

  const labelClass = isError
    ? 'text-error-red'
    : isValid
    ? 'text-core-green'
    : 'text-core-black';

  const inputClass = isError
    ? '!border-error-red !text-error-red !font-bold placeholder:text-error-red placeholder:font-bold'
    : isValid
    ? '!border-core-green !text-core-green !font-bold placeholder:text-core-green placeholder:font-bold'
    : '!border-black-400 !text-core-black placeholder:!text-black-700';

  const sharedClass = `!w-full !rounded !px-3 !py-2 !bg-core-white focus:!outline-none focus:!ring-0 !shadow-none !border !font-body !text-body placeholder:font-body ${inputClass}`;

  return (
    <Field.Root gap="0" className="!w-full font-body text-body">
      <Field.Label
        className={`!mb-2 !block !font-body !text-base !font-normal !leading-[21px] ${labelClass}`}
      >
        {label}
        {required && '*'}
      </Field.Label>

      {multiline ? (
        <Textarea
          className={`${sharedClass} !min-h-[96px] !resize-y`}
          rows={rows}
          value={currentValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <div className="relative !w-full">
          {prefix && (
            // Overlaid on the field rather than sitting beside it, so the input
            // keeps its full width. `z-10` is required: the input paints an
            // opaque background and would otherwise hide the prefix entirely.
            <span
              aria-hidden
              className={`pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 !font-body !text-body ${
                isError ? '!font-bold text-error-red' : 'text-core-black'
              }`}
            >
              {prefix}
            </span>
          )}
          <Input
            className={`${sharedClass} !h-10 ${prefix ? '!pl-7' : ''}`}
            value={currentValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            inputMode={inputMode}
          />
        </div>
      )}

      {isError && errorMessage && (
        <p className="mt-1 text-sm !italic text-error-red !font-body">
          {errorMessage}
        </p>
      )}
    </Field.Root>
  );
}
