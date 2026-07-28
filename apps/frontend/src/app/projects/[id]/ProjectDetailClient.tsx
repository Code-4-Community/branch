'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FaEdit } from 'react-icons/fa';
import { RxCaretRight } from 'react-icons/rx';
import NavBar from '../../components/Navbar';
import ExpensesTable from '../../components/ExpensesTable';
import StaffCard from '../../components/StaffCard';
import { useApi } from '@/hooks/useApi';
import { Project, Expenditure, Member } from '@/types';

const PREVIEW_EXPENSES = 8;
const PREVIEW_STAFF = 4;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const api = useApi();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [projectData, expenditureData, memberData] = await Promise.all([
          api.get<Project>(`/projects/${id}`),
          api.get<Expenditure[]>(`/projects/${id}/expenditures`),
          api.get<{ ok: boolean; body: { users: Member[] } }>(`/projects/${id}/members`),
        ]);
        setProject(projectData);
        setExpenditures(Array.isArray(expenditureData) ? expenditureData : []);
        setMembers(memberData?.body?.users ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
    // `api` has a stable identity (useMemo in useApi), so this does not loop.
  }, [id, api]);

  // financial info
  const totalBudget = project?.total_budget ? parseFloat(project.total_budget) : 0;
  const totalSpent = expenditures.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const totalRemaining = totalBudget - totalSpent;

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  // error / not found state
  if (error || !project) {
    return (
      <div className="flex min-h-screen">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--color-error-red)' }}>
            {error ?? 'Project not found.'}
          </p>
        </div>
      </div>
    );
  }

  // main page
  return (
    <div className="flex min-h-screen">
      <NavBar />

      <div className="!flex-1 bg-core-white !px-6 !py-6 lg:!px-10 lg:!py-8">

        {/* Project title row */}
        <div className="flex !justify-between !items-start !mb-3">
          <h1>{project.name}</h1>
          <button className="flex !items-center !gap-2 !bg-core-green !text-core-white !px-4 !py-2 !rounded-lg !text-sm !font-medium">
            <FaEdit size={13} />
            Edit Project
          </button>
        </div>

        <p className="!text-core-black !mb-8">{project.description}</p>

        {/* Stat cards */}
        <div className="flex flex-col md:flex-row justify-between !mb-10 gap-4">
          {[
            { label: 'Funding Received', value: totalBudget },
            { label: 'Total Spent',      value: totalSpent },
            { label: 'Total Remaining',  value: totalRemaining },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="!border !border-black-200 !rounded-xl !p-6 w-full md:w-[30%] lg:w-[28%] xl:w-[25%]"
            >
              <h4 className="!mb-2">{label}</h4>
              <h1 className="!truncate">
                ${value.toLocaleString()}
              </h1>
            </div>
          ))}
        </div>

        <div className="!grid !grid-cols-[3fr_2fr] !gap-15">
          {/* Expenses */}
          <div>
            <div className="!flex !justify-between !items-center !mb-3">
              <h4>Expenses</h4>
              <button className="!flex !items-center !gap-0.5 !text-core-black">
                <RxCaretRight size={18} />
                <h5>View More</h5>
              </button>
            </div>
            {expenditures.length === 0 ? (
              <p className="!text-sm !text-gray-500">No expenses recorded.</p>
            ) : (
              <div className="!border !border-black-200 !overflow-hidden">
                <ExpensesTable
                  expenditures={expenditures.slice(0, PREVIEW_EXPENSES)}
                  showDescription={false}
                />
              </div>
            )}
          </div>

          {/* Staff */}
          <div>
            <div className="!flex !justify-between !items-center !mb-3">
              <h4>Staff</h4>
              <button className="!flex !items-center !gap-0.5 !text-core-black">
                <RxCaretRight size={18} />
                <h5>View All</h5>
              </button>
            </div>
            {members.length === 0 ? (
              <p className="!text-sm !text-gray-500">No staff assigned.</p>
            ) : (
              <div className="!grid !grid-cols-2 !gap-3">
                {members.slice(0, PREVIEW_STAFF).map((member) => (
                  <StaffCard key={member.user_id} name={member.name} email={member.email} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}