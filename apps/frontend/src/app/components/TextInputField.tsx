'use client';

import { useState } from 'react';
import { Field, Input } from '@chakra-ui/react';

interface TextInputFieldProps {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isError?: boolean;
  errorMessage?: string;
  isValid?: boolean;
}

export default function TextInputField({
  label,
  value,
  onChange,
  placeholder = '',
  isError = false,
  errorMessage,
  isValid = false,
}: TextInputFieldProps) {
  const [internalValue, setInternalValue] = useState('');

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    if (!isControlled) setInternalValue(newValue);
    onChange?.(newValue);
  }

  const labelClass = isError
    ? 'text-error-red'
    : isValid
      ? 'text-core-green'
      : 'text-black-700';

  const inputClass = isError
    ? '!border-error-red !text-error-red !font-bold placeholder:text-error-red placeholder:font-bold'
    : isValid
      ? '!border-core-green !text-core-green !font-bold placeholder:text-core-green placeholder:font-bold'
      : '!border-black-200';

  return (
    <Field.Root className="!w-fit font-body text-body">
      <Field.Label className={`!block !mb-1 !text-base !font-normal !font-body ${labelClass}`}>
        {label}
      </Field.Label>
      <Input
        className={`!w-[235px] !rounded !px-3 !py-2 !h-10 !bg-core-white focus:!outline-none focus:!ring-0 !shadow-none !border !font-body !text-body placeholder:font-body ${inputClass}`}
        value={currentValue}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {isError && errorMessage && (
        <p className="mt-1 text-sm !italic text-error-red !font-body">{errorMessage}</p>
      )}
    </Field.Root>
  );
}
