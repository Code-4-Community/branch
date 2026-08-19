'use client';

import SpendingDonut from './SpendingDonut';
import { formatCurrency } from '@/lib/format';
import type { ProjectStats } from '@/types';

interface FundingSummaryProps {
  stats: Pick<
    ProjectStats,
    'totalBudget' | 'totalSpent' | 'totalRemaining' | 'spentPercentage'
  >;
}

/**
 * Total funding panel: the donut beside the budget / spent / remaining figures.
 *
 * Stacks below `sm` so the ring and the numbers each keep a readable size on a
 * phone rather than both shrinking to fit the design's fixed 667px row.
 */
export default function FundingSummary({ stats }: FundingSummaryProps) {
  return (
    <div className="flex flex-col items-center !gap-8 !py-4 sm:flex-row">
      <SpendingDonut percentage={stats.spentPercentage} />

      <div className="flex w-full min-w-0 flex-col gap-3">
        <div>
          <h1 className="!truncate !text-core-black">
            {formatCurrency(stats.totalBudget)}
          </h1>
          <p className="!text-core-black">total</p>
        </div>

        <hr className="!border-0 !border-t !border-solid !border-core-black" />

        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div className="min-w-0">
            <h3 className="!truncate !text-core-black">
              {formatCurrency(stats.totalSpent)}
            </h3>
            <p className="!text-core-black">spent</p>
          </div>
          <div className="min-w-0">
            {/* Remaining goes green in the design; a negative value means the
                project is over budget, so it flips to the error colour rather
                than reading as healthy. */}
            <h3
              className={`!truncate ${
                stats.totalRemaining < 0
                  ? '!text-error-red'
                  : '!text-core-green'
              }`}
            >
              {formatCurrency(stats.totalRemaining)}
            </h3>
            <p
              className={
                stats.totalRemaining < 0
                  ? '!text-error-red'
                  : '!text-core-green'
              }
            >
              {stats.totalRemaining < 0 ? 'over budget' : 'remaining'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
