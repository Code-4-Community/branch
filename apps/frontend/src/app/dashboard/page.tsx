'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LuChevronRight } from 'react-icons/lu';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import ProjectCard from '../components/ProjectCard';
import SummaryStatCard from '../components/SummaryStatCard';
import ExpensesBarChart from '../components/ExpensesBarChart';
import LoadingState from '../components/LoadingState';
import { useApi } from '@/hooks/useApi';
import { projectPath } from '@/lib/routes';
import type { DashboardResponse } from '@/types/dashboard';

/**
 * Admin-only overview of spend and projects. Gated twice: `/dashboard` is in
 * `ADMIN_PREFIXES`, and `GET /projects/dashboard` checks isAdmin server side.
 */

/** How many project cards the design shows before "View All". */
const PROJECT_PREVIEW_COUNT = 3;

function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

export default function DashboardPage() {
  const api = useApi();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.get<DashboardResponse>('/projects/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const topCategory = summary?.topExpenseCategory;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />
        <div className="flex flex-col !gap-6 !px-4 !py-5 sm:!px-8">
          {isLoading && <LoadingState label="Loading dashboard…" />}
          {error && <p className="text-error-red">{error}</p>}

          {!isLoading && !error && data && summary && (
            <>
              <section className="grid grid-cols-1 !gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:!gap-9">
                <SummaryStatCard
                  label="TOP EXPENSE CATEGORY"
                  value={topCategory ? topCategory.category : '—'}
                  caption={
                    topCategory
                      ? `${Math.round(topCategory.percentage)}% of expenses`
                      : 'no expenses yet'
                  }
                />
                <SummaryStatCard
                  label="TOTAL SPENT"
                  value={formatMoney(summary.totalSpent)}
                  caption="this year"
                />
                <SummaryStatCard
                  label="TOTAL PROJECTS"
                  value={summary.totalProjects.toLocaleString()}
                  caption="active projects"
                />
                <SummaryStatCard
                  label="AVG SPEND/PROJECT"
                  value={formatMoney(summary.averageSpendPerProject)}
                  caption="per project"
                />
              </section>

              <section className="flex flex-col !gap-4">
                <div className="flex items-center justify-between">
                  <h3>Projects</h3>
                  <Link
                    href="/projects"
                    className="flex shrink-0 items-center !gap-2 rounded !px-3 !py-0.5"
                  >
                    <LuChevronRight aria-hidden="true" className="size-6" />
                    <h5 className="text-core-black">View All</h5>
                  </Link>
                </div>

                {data.projects.length === 0 ? (
                  <p>No projects yet.</p>
                ) : (
                  <div className="grid grid-cols-1 !gap-4 md:grid-cols-2 xl:grid-cols-3 xl:!gap-9">
                    {data.projects
                      .slice(0, PROJECT_PREVIEW_COUNT)
                      .map((project) => (
                        <Link
                          key={project.project_id}
                          href={projectPath(project.project_id)}
                          className="flex"
                        >
                          <ProjectCard
                            fullWidth
                            variant="active"
                            name={project.name}
                            total_budget={project.total_budget ?? 0}
                            budget_used={project.spent}
                            members={project.staff_count}
                          />
                        </Link>
                      ))}
                  </div>
                )}
              </section>

              <section className="flex flex-col !gap-4">
                <h3>Total Expenses</h3>
                <ExpensesBarChart
                  year={data.year}
                  expenses={data.expensesByMonth}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
