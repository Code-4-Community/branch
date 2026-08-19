import React from 'react';
import type { DashboardMonthlyExpense } from '@/types/dashboard';

/** Stacked monthly expenditure chart. Hand-rolled — no chart library is a dep. */

// Fluid height, not the design's fixed px. Everything inside the plot is sized
// in percentages so the columns stay in step with the gridlines.
const PLOT_HEIGHT_CLASS = 'h-[clamp(11rem,30vh,19rem)]';
const TICK_INTERVALS = 4;

const MONTH_LABELS = [
  'Jan', 'Feb', 'March', 'April', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

// Categories the design names, darkest first. `expenditures.category` is free
// text, so unknown values get a fallback colour rather than being dropped.
const KNOWN_CATEGORIES: { label: string; color: string }[] = [
  { label: 'General', color: 'var(--color-primary-800)' },
  { label: 'Travel', color: 'var(--color-primary-600)' },
  { label: 'Travel Foreign', color: 'var(--color-primary-300)' },
  { label: 'Visitor/Honorarium', color: 'var(--color-primary-200)' },
];

const FALLBACK_COLORS = [
  'var(--color-primary-700)',
  'var(--color-primary-500)',
  'var(--color-primary-400)',
  'var(--color-primary-100)',
];

// Match on this, not the raw string: the expenses form writes
// "Visitor / Honorarium", the design names the band "Visitor/Honorarium".
function categoryKey(category: string): string {
  return category.replace(/\s+/g, '').toLowerCase();
}

/** Rounds up to a readable axis maximum that divides evenly into ticks. */
function axisMaxFor(peak: number): number {
  if (peak <= 0) return TICK_INTERVALS;
  const rawStep = peak / TICK_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((m) => m * magnitude)
      .find((candidate) => candidate >= rawStep) ?? 10 * magnitude;
  return step * TICK_INTERVALS;
}

function categoriesIn(expenses: DashboardMonthlyExpense[]) {
  const known = new Set(KNOWN_CATEGORIES.map((c) => categoryKey(c.label)));
  const extras = [
    ...new Map(
      expenses
        .filter((e) => !known.has(categoryKey(e.category)))
        .map((e) => [categoryKey(e.category), e.category]),
    ).values(),
  ].sort();

  return [
    ...KNOWN_CATEGORIES,
    ...extras.map((label, i) => ({
      label,
      color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    })),
  ].map((c) => ({ ...c, key: categoryKey(c.label) }));
}

interface ExpensesBarChartProps {
  year: number;
  expenses: DashboardMonthlyExpense[];
}

export default function ExpensesBarChart({
  year,
  expenses,
}: ExpensesBarChartProps) {
  const categories = categoriesIn(expenses);

  // The API only returns months that had spend; the axis always shows all 12.
  const months = MONTH_LABELS.map((label, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    const amounts = new Map<string, number>();
    for (const row of expenses) {
      if (row.month !== key) continue;
      const bucket = categoryKey(row.category);
      amounts.set(bucket, (amounts.get(bucket) ?? 0) + row.amount);
    }
    return { label, amounts };
  });

  const peak = Math.max(
    0,
    ...months.map((m) => [...m.amounts.values()].reduce((a, b) => a + b, 0)),
  );
  const axisMax = axisMaxFor(peak);
  const ticks = Array.from(
    { length: TICK_INTERVALS + 1 },
    (_, i) => (axisMax / TICK_INTERVALS) * i,
  );

  return (
    <div className="flex flex-col !gap-4 lg:flex-row">
      {/* Stacks above the plot on narrow screens, sits beside it from lg up. */}
      <ul className="flex list-none flex-row flex-wrap !gap-x-6 !gap-y-3 self-start rounded !p-2 lg:!mt-9 lg:max-w-36 lg:shrink-0 lg:flex-col lg:!gap-4">
        {categories.map((category) => (
          <li key={category.label} className="flex items-start !gap-2">
            <span
              aria-hidden="true"
              className="!mt-0.5 size-4 shrink-0"
              style={{ backgroundColor: category.color }}
            />
            <small className="!font-bold text-core-black">
              {category.label}
            </small>
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-1">
        <div className={`relative w-12 shrink-0 sm:w-14 ${PLOT_HEIGHT_CLASS}`}>
          {ticks.map((tick, i) => (
            <small
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-core-black"
              style={{ top: `${100 - (i / TICK_INTERVALS) * 100}%` }}
            >
              {tick.toLocaleString()}
            </small>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 !pl-2">
          <div
            className={`absolute inset-x-0 top-0 ${PLOT_HEIGHT_CLASS}`}
            aria-hidden="true"
          >
            {ticks.map((tick, i) => (
              <div
                key={tick}
                className="absolute inset-x-0 !border-t-[1px] border-solid !border-black-200"
                style={{ top: `${100 - (i / TICK_INTERVALS) * 100}%` }}
              />
            ))}
          </div>

          <div className="relative flex items-end !gap-1 sm:!gap-2">
            {months.map((month, index) => (
              <div
                key={month.label}
                className="flex min-w-0 flex-1 flex-col items-center"
              >
                <div
                  className={`flex w-[70%] flex-col justify-end ${PLOT_HEIGHT_CLASS}`}
                >
                  {/* Rendered top-down, so the legend's darkest category
                      lands at the base of the column as designed. */}
                  {[...categories].reverse().map((category) => {
                    const amount = month.amounts.get(category.key) ?? 0;
                    if (amount <= 0) return null;
                    return (
                      <div
                        key={category.label}
                        style={{
                          height: `${(amount / axisMax) * 100}%`,
                          backgroundColor: category.color,
                        }}
                      />
                    );
                  })}
                </div>
                <small className="!mt-1 text-core-black">
                  {index % 2 === 0 ? month.label : ' '}
                </small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
