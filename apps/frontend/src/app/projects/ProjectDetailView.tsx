'use client';

import { useCallback, useEffect, useState } from 'react';
import { LuCircleDollarSign, LuDollarSign, LuTrash2, LuUsers } from 'react-icons/lu';
import { FaRegEdit } from 'react-icons/fa';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import SectionHeading from '../components/SectionHeading';
import FundingSummary from '../components/FundingSummary';
import ExpensesTable from '../components/ExpensesTable';
import StaffCard from '../components/StaffCard';
import ProjectFormModal from '../components/ProjectFormModal';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { useApi } from '@/hooks/useApi';
import { usePermissions } from '@/hooks/usePermissions';
import { DEFAULT_LANDING_PATH } from '@/lib/routes';
import type { ProjectOverview } from '@/types';

/** The detail page previews a slice of each list; "View All" reveals the rest. */
const PREVIEW_EXPENSES = 4;
const PREVIEW_STAFF = 4;

export default function ProjectDetailView({ id }: { id: string }) {
  const api = useApi();
  const { can } = usePermissions();

  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      // One request for the header, funding panel, staff and expenses — the
      // page used to issue three and still summed the budget on the client.
      setOverview(await api.get<ProjectOverview>(`/projects/${id}/overview`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id, api]);

  useEffect(() => {
    void load();
  }, [load]);

  // The row is gone once this resolves, so leave the detail page rather than
  // refetching an id that now 404s.
  //
  // A full document navigation rather than `router.push`: the Navbar caches its
  // project list behind a one-shot ref and the dashboard caches its counts, so
  // a client-side transition would keep showing the project that just went away.
  const handleDelete = useCallback(async () => {
    await api.del(`/projects/${id}`);
    window.location.assign(DEFAULT_LANDING_PATH);
  }, [api, id]);

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen">
      <NavBar activeProjectId={Number(id)} />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />
        <div className="flex flex-col !gap-4 !px-4 !py-5 sm:!px-8">
          {children}
        </div>
      </main>
    </div>
  );

  if (loading) return shell(<LoadingState label="Loading project…" />);
  if (error)
    return shell(
      <p role="alert" className="!font-bold !text-error-red">
        {error}
      </p>,
    );
  if (!overview) return shell(<p>Project not found.</p>);

  const { project, stats, members, expenditures } = overview;
  const canEdit = can('project:update');
  const visibleStaff = showAllStaff ? members : members.slice(0, PREVIEW_STAFF);
  const visibleExpenses = showAllExpenses
    ? expenditures
    : expenditures.slice(0, PREVIEW_EXPENSES);

  return (
    <>
      {shell(
        <>
          <div className="flex flex-wrap items-start justify-between !gap-4">
            <h1 className="min-w-0 break-words">{project.name}</h1>
            <div className="flex flex-wrap items-center !gap-3">
              {canEdit && (
                <Button
                  icon={<FaRegEdit aria-hidden />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit Project
                </Button>
              )}
              {/* Deleting a project cascades to its memberships, donations,
                  expenditures and reports, so it is its own permission even
                  though both currently resolve to admin. */}
              {can('project:delete') && (
                <Button
                  variant="danger"
                  icon={<LuTrash2 aria-hidden />}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete Project
                </Button>
              )}
            </div>
          </div>

          {project.description && (
            <p className="max-w-[90ch] !text-core-black">
              {project.description}
            </p>
          )}

          <hr className="!border-0 !border-t !border-solid !border-black-500" />

          {/* Funding and expenses share the wide column, staff takes the narrow
              one — a 2:1 split, matching the design's 673px/333px columns.
              Stacks below `lg`, where the donut and a table cannot share a row. */}
          <div className="grid !gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col !gap-6">
              <section className="flex flex-col !gap-2">
                <SectionHeading
                  label="Total Funding"
                  icon={<LuDollarSign aria-hidden />}
                />
                <FundingSummary stats={stats} />
              </section>

              <section className="flex min-w-0 flex-col !gap-2">
                <SectionHeading
                  label="Expenses"
                  icon={<LuCircleDollarSign aria-hidden />}
                  onViewAll={
                    expenditures.length > PREVIEW_EXPENSES
                      ? () => setShowAllExpenses((prev) => !prev)
                      : undefined
                  }
                />
                {/* Scrolls horizontally rather than shrinking columns: the table
                    has a readable minimum width and the page is otherwise fluid. */}
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <ExpensesTable
                      expenditures={visibleExpenses}
                      showProject={false}
                      showReceipt={false}
                    />
                  </div>
                </div>
              </section>
            </div>

            <section className="flex min-w-0 flex-col !gap-2">
              <SectionHeading
                label="Staff"
                icon={<LuUsers aria-hidden />}
                onViewAll={
                  members.length > PREVIEW_STAFF
                    ? () => setShowAllStaff((prev) => !prev)
                    : undefined
                }
              />
              {members.length === 0 ? (
                <p className="!text-black-700">No staff assigned yet.</p>
              ) : (
                <div className="flex flex-col !gap-3">
                  {visibleStaff.map((member) => (
                    <StaffCard
                      key={member.user_id}
                      compact
                      name={member.name}
                      title={member.role}
                      email={member.email}
                      image={member.profile_image ?? undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </>,
      )}

      <ProjectFormModal
        open={isEditOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        members={members}
        onSaved={() => void load()}
      />

      <ConfirmDeleteDialog
        open={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Project"
        itemName={project.name}
        confirmLabel="Delete Project"
        // Every FK into `projects` is ON DELETE CASCADE, so this takes the
        // financial history with it. Worth retyping the name for.
        requireTypedConfirmation
        consequences={
          <>
            <p>This also permanently deletes everything attached to it:</p>
            <ul className="!mt-2 !list-disc !pl-5">
              <li>
                {expenditures.length} expense
                {expenditures.length === 1 ? '' : 's'}
              </li>
              <li>
                {members.length} staff assignment
                {members.length === 1 ? '' : 's'}
              </li>
              <li>
                its donations, and every report and receipt file it owns
              </li>
            </ul>
          </>
        }
      />
    </>
  );
}
