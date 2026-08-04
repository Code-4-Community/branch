'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import ProjectCard from '../components/ProjectCard';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Dashboard, ProjectSummary } from '@/types';

/**
 * Landing page for a signed-in user, and the target the login flow redirects to.
 *
 * The Navbar has always linked here; the route simply never existed.
 */

export default function DashboardPage() {
  const api = useApi();
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // /projects/dashboard rather than /projects: it returns the same set of
  // projects (scoped to the caller) already carrying the spend and staff counts
  // the cards need, so there is nothing left to aggregate client-side.
  const load = useCallback(async () => {
    try {
      setError(null);
      const dashboard = await api.get<Dashboard>('/projects/dashboard');
      setProjects(dashboard.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName = user?.name?.split(' ')[0];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <NavBar />
      <main style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <Header />
        <div
          style={{
            margin: '2%',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <h1
            style={{
              fontWeight: 600,
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--font-size-heading-1)',
            }}
          >
            {firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
          </h1>

          {isLoading && <p>Loading projects…</p>}
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
          {!isLoading && !error && projects.length === 0 && (
            <p>You are not a member of any projects yet.</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {projects.map((project) => (
              <Link
                key={project.project_id}
                href={`/projects/${project.project_id}`}
                style={{ display: 'contents' }}
              >
                <ProjectCard
                  variant="active"
                  name={project.name}
                  total_budget={project.total_budget ?? 0}
                  budget_used={project.spent}
                  members={project.staff_count}
                />
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
