'use client';

import type React from 'react';
import { Checkbox, Table } from '@chakra-ui/react';
import TableSkeletonRows, { type SkeletonColumn } from './TableSkeletonRows';

export interface DataTableColumn<T> {
  /** Stable identity for the column; doubles as the React key. */
  key: string;
  header: React.ReactNode;
  /** Width for the `<colgroup>`; percentages keep the table fluid. */
  width?: string;
  align?: 'left' | 'center' | 'right';
  cell: (row: T) => React.ReactNode;
  /** Shape of this column's loading placeholder — a pill, a short bar, etc. */
  skeleton?: SkeletonColumn;
}

/**
 * Row selection is driven from outside: the pages that support it already own
 * the selected ids because that is what their bulk actions operate on.
 */
export interface DataTableSelection<T> {
  isSelected: (row: T) => boolean;
  onToggleRow: (row: T) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  /** Accessible name for the header checkbox, e.g. "Select all reports". */
  label?: string;
  disabled?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => React.Key;
  /** Replaces the body with skeleton rows, keeping the header and widths. */
  isLoading?: boolean;
  loadingLabel?: string;
  /** Ideally the page size, so the table does not resize when data lands. */
  skeletonRows?: number;
  emptyMessage?: React.ReactNode;
  onRowClick?: (row: T) => void;
  selection?: DataTableSelection<T>;
  variant?: 'line' | 'outline';
}

const CHECKBOX_CONTROL_CSS = {
  backgroundColor: 'var(--color-core-white)',
  borderColor: 'var(--color-core-green)',
  '&[data-state="checked"]': {
    backgroundColor: 'var(--color-primary-800)',
    borderColor: 'var(--color-core-green)',
  },
};

/**
 * The app's one table. Every list view goes through here so the green header
 * row, column sizing, empty state and loading skeleton stay identical
 * everywhere — previously each page rebuilt all four by hand and they drifted.
 *
 * Columns are data, not markup: give each one a `cell` renderer and, where the
 * default bar is wrong, a `skeleton` shape.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  loadingLabel = 'Loading…',
  skeletonRows = 5,
  emptyMessage = 'Nothing to show yet.',
  onRowClick,
  selection,
  variant,
}: DataTableProps<T>) {
  const columnCount = columns.length + (selection ? 1 : 0);
  const hasWidths = columns.some((column) => column.width);

  const skeletonColumns: SkeletonColumn[] = [
    // The checkbox slot gets a square rather than a bar, so the loading table
    // reads as the same shape as the loaded one.
    ...(selection ? [{ width: '18px', height: 18 } as SkeletonColumn] : []),
    ...columns.map((column) => ({
      align: column.align,
      ...column.skeleton,
    })),
  ];

  return (
    <Table.Root variant={variant} width="100%" tableLayout={hasWidths ? 'fixed' : undefined}>
      {hasWidths && (
        <Table.ColumnGroup>
          {selection && <Table.Column width="48px" />}
          {columns.map((column) => (
            <Table.Column key={column.key} width={column.width} />
          ))}
        </Table.ColumnGroup>
      )}

      <Table.Header>
        <Table.Row backgroundColor="var(--color-primary-800)">
          {selection && (
            <Table.ColumnHeader width="48px" paddingY="12px">
              <Checkbox.Root
                checked={
                  selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false
                }
                onCheckedChange={selection.onToggleAll}
                disabled={selection.disabled}
                aria-label={selection.label ?? 'Select all rows'}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control borderRadius="md" css={CHECKBOX_CONTROL_CSS} />
              </Checkbox.Root>
            </Table.ColumnHeader>
          )}
          {columns.map((column) => (
            <Table.ColumnHeader
              key={column.key}
              color="var(--color-core-white)"
              textAlign={column.align}
            >
              <h5>{column.header}</h5>
            </Table.ColumnHeader>
          ))}
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {isLoading ? (
          <TableSkeletonRows
            rows={skeletonRows}
            columns={skeletonColumns}
            label={loadingLabel}
          />
        ) : rows.length === 0 ? (
          <Table.Row>
            <Table.Cell
              colSpan={columnCount}
              textAlign="center"
              paddingY="32px"
              color="var(--color-black-500)"
            >
              {emptyMessage}
            </Table.Cell>
          </Table.Row>
        ) : (
          rows.map((row) => (
            <Table.Row
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              // Rows that act like buttons have to be reachable without a
              // mouse; the target check keeps Enter on a nested control (a
              // receipt link, a checkbox) from also opening the row.
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              cursor={onRowClick ? 'pointer' : undefined}
              _hover={onRowClick ? { backgroundColor: 'var(--color-primary-100)' } : undefined}
            >
              {selection && (
                <Table.Cell onClick={(event) => event.stopPropagation()}>
                  <Checkbox.Root
                    checked={selection.isSelected(row)}
                    onCheckedChange={() => selection.onToggleRow(row)}
                    disabled={selection.disabled}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control borderRadius="md" css={CHECKBOX_CONTROL_CSS} />
                  </Checkbox.Root>
                </Table.Cell>
              )}
              {columns.map((column) => (
                <Table.Cell
                  key={column.key}
                  textAlign={column.align}
                  overflow="hidden"
                  whiteSpace="nowrap"
                  textOverflow="ellipsis"
                >
                  {column.cell(row)}
                </Table.Cell>
              ))}
            </Table.Row>
          ))
        )}
      </Table.Body>
    </Table.Root>
  );
}
