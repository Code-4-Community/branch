'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LuPlus } from 'react-icons/lu';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import ProjectCard from '../components/ProjectCard';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import ProjectFormModal from '../components/ProjectFormModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useApi } from '@/hooks/useApi';
import { formatDateLong } from '@/lib/format';
import { projectPath } from '@/lib/routes';
import type { ProjectSummary } from '@/types';

/**
 * Projects index: active projects first, then archived, with the add-project
 * entry point. A project is archived once its end date has passed — the split
 * is computed server-side and arrives as `is_active`.
 */
export default function ProjectListView() {
  const api = useApi();
  const { can } = usePermissions();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await api.get<ProjectSummary[]>('/projects');
      setProjects(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const { active, archived } = useMemo(
    () => ({
      active: projects.filter((p) => p.is_active),
      archived: projects.filter((p) => !p.is_active),
    }),
    [projects],
  );

  const renderGrid = (rows: ProjectSummary[], emptyLabel: string) => {
    if (rows.length === 0) {
      return <p className="!text-black-700">{emptyLabel}</p>;
    }
    return (
      // auto-fill rather than fixed column counts: cards keep the design's
      // ~300px width and the row simply fits as many as the viewport allows.
      // The 300px floor is what keeps "$52,500/ $100,000" on one line.
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] !gap-6">
        {rows.map((project) => (
          <Link
            key={project.project_id}
            href={projectPath(project.project_id)}
            className="flex rounded-[4px] transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-core-green"
          >
            {project.is_active ? (
              <ProjectCard
                fullWidth
                variant="active"
                name={project.name}
                total_budget={Number(project.total_budget ?? 0)}
                budget_used={project.total_spent}
                members={project.member_count}
              />
            ) : (
              <ProjectCard
                fullWidth
                variant="archive"
                name={project.name}
                total_budget={Number(project.total_budget ?? 0)}
                members={project.member_count}
                start_date={formatDateLong(project.start_date)}
                end_date={formatDateLong(project.end_date)}
              />
            )}
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />

        <div className="flex flex-col !gap-8 !px-4 !py-5 sm:!px-8">
          {isLoading && <LoadingState label="Loading projects…" />}
          {error && (
            <p role="alert" className="!font-bold !text-error-red">
              {error}
            </p>
          )}

          {!isLoading && !error && (
            <>
              <section className="flex flex-col !gap-4">
                {/* The "Add New Project" action sits on the first section's
                    heading row rather than a separate page title, as designed. */}
                <div className="flex flex-wrap items-center justify-between !gap-4">
                  <h1>Active Projects</h1>
                  {can('project:create') && (
                    <Button icon={<LuPlus aria-hidden />} onClick={() => setFormOpen(true)}>
                      Add New Project
                    </Button>
                  )}
                </div>
                {renderGrid(active, 'No active projects.')}
              </section>

              <section className="flex flex-col !gap-4">
                <h1>Archived Projects</h1>
                {renderGrid(archived, 'No archived projects.')}
              </section>
            </>
          )}
        </div>
      </main>

      <ProjectFormModal
        open={isFormOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
