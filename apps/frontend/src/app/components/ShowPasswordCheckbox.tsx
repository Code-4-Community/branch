'use client';

import { Checkbox } from '@chakra-ui/react';

interface ShowPasswordCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Distinguishes the two checkboxes when a form has more than one. */
  label?: string;
}

/**
 * Toggles the masking on a password field. Shared so login and the
 * set-password form stay identical.
 */
export default function ShowPasswordCheckbox({
  checked,
  onChange,
  label = 'Show password',
}: ShowPasswordCheckboxProps) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(e) => onChange(!!e.checked)}
      className="!self-start"
      gap="2"
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control
        borderRadius="sm"
        css={{
          backgroundColor: 'var(--color-core-white)',
          borderColor: 'var(--color-core-green)',
          '&[data-state="checked"]': {
            backgroundColor: 'var(--color-primary-800)',
            borderColor: 'var(--color-core-green)',
          },
        }}
      />
      <Checkbox.Label className="![font-family:var(--font-body)] !text-[14px] !font-normal !text-core-black">
        {label}
      </Checkbox.Label>
    </Checkbox.Root>
  );
}
