'use client';

import { Table } from '@chakra-ui/react';
import Skeleton from './Skeleton';

export interface SkeletonColumn {
  /**
   * Width of the bar inside the cell. Percentages get a per-row jitter so the
   * block reads like text rather than a bar chart; absolute lengths are left
   * exactly as given, for fixed slots such as a checkbox or an icon.
   */
  width?: string;
  align?: 'left' | 'center' | 'right';
  height?: number;
  /** Extra classes on the bar, e.g. `!rounded-full` for a status pill. */
  className?: string;
}

interface TableSkeletonRowsProps {
  /** Ideally the page size, so the table does not resize when data lands. */
  rows?: number;
  /** A count for evenly-filled cells, or per-column shapes. */
  columns: number | SkeletonColumn[];
  label?: string;
}

/** Deterministic — `Math.random()` here would churn on every re-render. */
const JITTER = [1, 0.82, 0.93, 0.71, 0.88, 0.78];

/**
 * Skeleton rows to drop inside a `Table.Body` while its data loads, so the
 * header, column widths and page height stay put and the table fades in
 * instead of popping.
 *
 * ```tsx
 * <Table.Body>
 *   {loading ? <TableSkeletonRows rows={10} columns={5} /> : rows.map(...)}
 * </Table.Body>
 * ```
 */
export default function TableSkeletonRows({
  rows = 5,
  columns,
  label = 'Loading…',
}: TableSkeletonRowsProps) {
  const shape: SkeletonColumn[] =
    typeof columns === 'number' ? Array.from({ length: columns }, () => ({})) : columns;

  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <Table.Row key={rowIndex}>
          {shape.map((column, columnIndex) => {
            const width = column.width ?? '70%';
            const jitter = JITTER[(rowIndex * 3 + columnIndex) % JITTER.length];
            const align = column.align ?? 'left';

            return (
              <Table.Cell key={columnIndex} paddingY="14px">
                {rowIndex === 0 && columnIndex === 0 && (
                  <span role="status" aria-live="polite" className="sr-only">
                    {label}
                  </span>
                )}
                <span
                  className="flex"
                  style={{
                    justifyContent:
                      align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                  }}
                >
                  <Skeleton
                    width={width.endsWith('%') ? `calc(${width} * ${jitter})` : width}
                    height={column.height ?? 14}
                    delayMs={rowIndex * 90}
                    className={column.className}
                  />
                </span>
              </Table.Cell>
            );
          })}
        </Table.Row>
      ))}
    </>
  );
}
