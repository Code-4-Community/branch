'use client';

import { useMemo } from 'react';
import { createListCollection, Portal, Select } from '@chakra-ui/react';

/**
 * Options are plain strings where the label *is* the value. Pass the object
 * form when the two differ — selecting a donor by name has to yield its id,
 * and organization names are not unique.
 */
export type DropdownOption = string | { label: string; value: string };

interface DropdownSelectorProps {
  options: DropdownOption[];
  placeholder?: string;
  multiSelect?: boolean;
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  hideTrigger?: boolean;
}

export default function DropdownSelector({
  options,
  placeholder = 'Select...',
  multiSelect = false,
  value,
  onChange,
  hideTrigger = false,
}: DropdownSelectorProps) {
  const collection = useMemo(
    () =>
      createListCollection({
        items: options.map((o) =>
          typeof o === 'string' ? { label: o, value: o } : o,
        ),
      }),
    [options],
  );

  const controlledValue =
    value !== undefined ? (Array.isArray(value) ? value : [value]) : undefined;

  function handleValueChange(details: { value: string[] }) {
    if (!onChange) return;
    onChange(multiSelect ? details.value : (details.value[0] ?? ''));
  }

  return (
    <div className="w-full font-body text-body">
      <Select.Root
        collection={collection}
        multiple={multiSelect}
        value={controlledValue}
        onValueChange={handleValueChange}
        open={hideTrigger ? true : undefined}
        closeOnSelect={!multiSelect && !hideTrigger}
      >
        <Select.Trigger
          style={
            hideTrigger
              ? {
                  height: 0,
                  minHeight: 0,
                  width: 0,
                  padding: 0,
                  margin: 0,
                  border: 0,
                  overflow: 'hidden',
                  visibility: 'hidden',
                  position: 'absolute',
                }
              : undefined
          }
          className={
            hideTrigger
              ? ''
              : 'flex !w-full items-center justify-between !rounded !border !border-black-200 !bg-core-white !px-3 !py-2 !h-10 cursor-pointer !shadow-none !text-black-700 !font-body !text-body'
          }
        >
          {!hideTrigger && (
            <>
              <Select.ValueText placeholder={placeholder} className="truncate" />
              <Select.Indicator className="ml-2 shrink-0 transition-transform data-[state=open]:rotate-180">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </Select.Indicator>
            </>
          )}
        </Select.Trigger>

        <Portal>
          <Select.Positioner style={{ width: 'var(--reference-width)', left:"3px" }}>
          <Select.Content className="!rounded !border !border-black-200 !bg-core-white !shadow-none !p-0 !mt-0.5 !font-body !text-body !max-h-[176px] !overflow-y-auto">              {collection.items.map((item) =>
                multiSelect ? (
                  <Select.Item
                    key={item.value}
                    item={item}
                    className="group !flex items-center !gap-3 !px-3 !py-2.5 cursor-pointer data-[highlighted]:!bg-primary-100 [&:not(:first-child)]:!border-t [&:not(:first-child)]:!border-black-200"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded !border !border-black-300 bg-core-white group-data-[state=checked]:!bg-core-green group-data-[state=checked]:!border-core-green">
                      <svg
                        className="h-3 w-3 text-core-white opacity-0 group-data-[state=checked]:opacity-100"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <Select.ItemText className="!text-black-700">{item.label}</Select.ItemText>
                  </Select.Item>
                ) : (
                  <Select.Item
                    key={item.value}
                    item={item}
                    className="!px-3 !py-2.5 cursor-pointer !text-black-700 data-[highlighted]:!bg-primary-100 data-[state=checked]:!bg-core-green data-[state=checked]:!text-core-white data-[state=checked]:!font-bold [&:not(:first-child)]:!border-t [&:not(:first-child)]:!border-black-200"
                  >
                    <Select.ItemText>{item.label}</Select.ItemText>
                  </Select.Item>
                ),
              )}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    </div>
  );
}
