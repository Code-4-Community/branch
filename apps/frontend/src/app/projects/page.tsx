'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FullPageSpinner from '../components/FullPageSpinner';
import ProjectListView from './ProjectListView';
import ProjectDetailView from './ProjectDetailView';

/**
 * `/projects` lists every project; `/projects?id=1` is one project.
 *
 * One route rather than a `/projects/[id]` segment because the app is a static
 * export: a dynamic segment only emits documents for the ids known at build
 * time, and project ids are database rows. Real ids would have no document and
 * would depend on a hosting fallback serving some other page's shell, which is
 * what made deep links 404. A query param needs no such rule.
 */
function ProjectsRoute() {
  const id = useSearchParams().get('id');
  return id ? <ProjectDetailView id={id} /> : <ProjectListView />;
}

export default function ProjectsPage() {
  // useSearchParams suspends during prerender, and export builds fail without
  // a boundary here.
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProjectsRoute />
    </Suspense>
  );
}
