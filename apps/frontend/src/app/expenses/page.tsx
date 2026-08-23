'use client';
import React, { useEffect, useState, Suspense } from 'react';
import { useQueryParams } from '@/hooks/useQueryParams';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import Pagination from '../components/Pagination';
import AddExpenseModal from '../components/AddExpenseModal';
import {
  HStack,
  Input,
  Button,
} from '@chakra-ui/react';
import DropdownSelector from '../components/DropdownSelector';
import ExpenseFilterMenu, { type FilterGroup } from '../components/ExpenseFilterMenu';
import ReviewExpenseModal from '../components/ReviewExpenseModal';
import { useApi } from '@/hooks/useApi';
import { usePermissions } from '@/hooks/usePermissions';
import Tooltip from '../components/Tooltip';
import { LuArrowDownUp } from 'react-icons/lu';
import { FaPlus } from 'react-icons/fa';
import { IoClose } from 'react-icons/io5';
import ExpensesTable from '../components/ExpensesTable';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { getReceiptDownloadUrl } from '@/lib/expenditures';
import { formatCurrencyPrecise } from '@/lib/format';
import {
  EXPENDITURE_STATUSES,
  EXPENDITURE_STATUS_LABELS,
  Expenditure,
  Project,
} from '@/types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SORT_OPTIONS = ['Amount', 'Date'];
const ROWS_PER_PAGE = 10;

// Not exported: Next.js rejects non-page exports from a page module.
const EXPENSE_CATEGORIES = [
  'General',
  'Travel',
  'Travel Foreign',
  'Visitor / Honorarium',
];

export default function ExpensePage() {
  return (
    <Suspense>
      <ExpensePageContent />
    </Suspense>
  );
}

function ExpensePageContent() {
  const api = useApi();
  const { why } = usePermissions();
  // Enabled when they could file against *any* project; which project decides
  // the real permission, and the modal's own list is already scoped to theirs.
  const cannotCreate = why('expenses:create');

  // Data
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [projects, setProjects] = useState<Pick<Project, 'project_id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters (synced to URL query params)
  const [filters, setFilter] = useQueryParams({
    q: '',
    months: [] as string[],
    types: [] as string[],
    projects: [] as string[],
    statuses: [] as string[],
    sort: '',
    page: '',
  });

  const query = filters.q;
  const selectedMonths = filters.months;
  const selectedTypes = filters.types;
  const selectedProjects = filters.projects;
  const selectedStatuses = filters.statuses;
  const sortOption = filters.sort;
  const currentPage = parseInt(filters.page, 10) || 1;

  // Dropdown visibility
  const [showSortBy, setShowSortBy] = useState(false);

  // Modals
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [reviewExpenditureId, setReviewExpenditureId] = useState<number | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expenditure | null>(null);


  // Fetch expenditures
  async function fetchExpenditures() {
    try {
      const json = await api.get<{ data: Expenditure[] }>('/expenditures');
      setExpenditures(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenditures');
    } finally {
      setLoading(false);
    }
  }

  // Fetch projects
  async function fetchProjects() {
    try {
      const json = await api.get<Project[]>('/projects');
      setProjects(Array.isArray(json) ? json : []);
    } catch {
      // Projects fetch failure is non-critical
    }
  }

  useEffect(() => {
    fetchExpenditures();
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueCategories = EXPENSE_CATEGORIES;

  const projectNames = Object.fromEntries(projects.map((p) => [p.project_id, p.name]));

  const filterGroups: FilterGroup[] = [
    {
      key: 'months',
      label: 'Month',
      options: MONTHS.map((m) => ({ value: m, label: m })),
      selected: selectedMonths,
      onChange: (next) => setFilter({ months: next, page: '' }),
    },
    {
      key: 'projects',
      label: 'Project',
      options: projects.map((p) => ({ value: p.name, label: p.name })),
      selected: selectedProjects,
      onChange: (next) => setFilter({ projects: next, page: '' }),
    },
    {
      key: 'types',
      label: 'Type',
      options: uniqueCategories.map((c) => ({ value: c, label: c })),
      selected: selectedTypes,
      onChange: (next) => setFilter({ types: next, page: '' }),
    },
    {
      key: 'statuses',
      label: 'Status',
      options: EXPENDITURE_STATUSES.map((s) => ({ value: s, label: EXPENDITURE_STATUS_LABELS[s] })),
      selected: selectedStatuses,
      onChange: (next) => setFilter({ statuses: next, page: '' }),
    },
  ];

  const activeFilterCount =
    selectedMonths.length + selectedProjects.length + selectedTypes.length + selectedStatuses.length;

  async function handleViewReceipt(expenditure: Expenditure) {
    try {
      const { downloadUrl } = await getReceiptDownloadUrl(expenditure.expenditure_id);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open receipt');
    }
  }

  // Filtered + sorted data
  const filteredData = expenditures
    .filter((e) => {
      if (query) {
        const q = query.toLowerCase();
        const matchesId = e.expenditure_id.toString().includes(q);
        const matchesDesc = (e.description ?? '').toLowerCase().includes(q);
        const matchesCat = (e.category ?? '').toLowerCase().includes(q);
        if (!matchesId && !matchesDesc && !matchesCat) return false;
      }
      if (selectedMonths.length > 0) {
        const month = new Date(e.spent_on).getMonth();
        if (!selectedMonths.includes(MONTHS[month])) return false;
      }
      if (selectedTypes.length > 0) {
        if (!e.category || !selectedTypes.includes(e.category)) return false;
      }
      if (selectedProjects.length > 0) {
        const projectName = projects.find((p) => p.project_id === e.project_id)?.name;
        if (!projectName || !selectedProjects.includes(projectName)) return false;
      }
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(e.status)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === 'Amount') {
        return parseFloat(b.amount) - parseFloat(a.amount);
      }
      if (sortOption === 'Date') {
        return new Date(b.spent_on).getTime() - new Date(a.spent_on).getTime();
      }
      // Default: newest first
      return new Date(b.spent_on).getTime() - new Date(a.spent_on).getTime();
    });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ROWS_PER_PAGE));
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );


  // Modal success handler
  async function handleExpenseAdded() {
    setShowNewExpense(false);
    setLoading(true);
    setError(null);
    await fetchExpenditures();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <NavBar />
      <main style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <Header />
        <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
          <h1
            style={{
              fontWeight: 600,
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--font-size-heading-1)',
            }}
          >
            Expenses
          </h1>

          {/* Toolbar */}
          <HStack width="100%" justify="space-between" paddingTop="32px" paddingBottom="32px">
            <HStack width="30%" gap="12px">
              <Input
                placeholder="Search ..."
                variant="outline"
                value={query}
                onChange={(e) => setFilter({ q: e.target.value, page: '' })}
              />
              {activeFilterCount > 0 && (
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  flexShrink={0}
                  onClick={() =>
                    setFilter({ months: [], types: [], projects: [], statuses: [], page: '' })
                  }
                >
                  <IoClose />
                  Clear Filters ({activeFilterCount})
                </Button>
              )}
            </HStack>
            <HStack>
              {/* Filter By */}
              <ExpenseFilterMenu groups={filterGroups} />

              {/* Sort By */}
              <div style={{ position: 'relative' }}>
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  onClick={() => setShowSortBy((prev) => !prev)}
                >
                  <LuArrowDownUp />
                  Sort By
                </Button>
                {showSortBy && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={SORT_OPTIONS}
                      multiSelect={false}
                      hideTrigger={true}
                      value={sortOption}
                      onChange={(val) => setFilter({ sort: val as string, page: '' })}
                    />
                  </div>
                )}
              </div>

              {/* + New Expense */}
              <Tooltip label={cannotCreate} wrapsDisabledControl={cannotCreate !== undefined}>
                <Button
                  backgroundColor="var(--color-core-green)"
                  color="var(--color-core-white)"
                  disabled={cannotCreate !== undefined}
                  onClick={() => setShowNewExpense(true)}
                >
                  <FaPlus />
                  New Expense
                </Button>
              </Tooltip>
            </HStack>
          </HStack>

          {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}

          {/* Table — the skeleton lives inside it, so the header and column
              widths stay put while the rows load. */}
          {!error && (
            <ExpensesTable
              isLoading={loading}
              skeletonRows={ROWS_PER_PAGE}
              expenditures={paginatedData}
              projectNames={projectNames}
              onViewReceipt={handleViewReceipt}
              onRowClick={(e) => setReviewExpenditureId(e.expenditure_id)}
              onDelete={setExpenseToDelete}
            />
          )}

          {/* Pagination */}
          {!loading && !error && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(p) => setFilter({ page: String(p) })}
            />
          )}
        </div>


        {/* Add New Expense Modal */}
        <AddExpenseModal
          open={showNewExpense}
          onClose={() => setShowNewExpense(false)}
          onSuccess={handleExpenseAdded}
          categories={uniqueCategories}
          projects={projects}
        />

        {/* Review Expense Modal */}
        <ReviewExpenseModal
          expenditureId={reviewExpenditureId}
          open={reviewExpenditureId !== null}
          onClose={() => setReviewExpenditureId(null)}
          onReviewed={async () => {
            setReviewExpenditureId(null);
            await fetchExpenditures();
          }}
        />

        <ConfirmDeleteDialog
          open={expenseToDelete !== null}
          onClose={() => setExpenseToDelete(null)}
          onConfirm={async () => {
            if (!expenseToDelete) return;
            await api.del(`/expenditures/${expenseToDelete.expenditure_id}`);
            await fetchExpenditures();
          }}
          title="Delete Expense"
          itemName={
            expenseToDelete
              ? `expense #${String(expenseToDelete.expenditure_id).padStart(6, '0')}`
              : undefined
          }
          consequences={
            expenseToDelete ? (
              <p>
                {formatCurrencyPrecise(expenseToDelete.amount)} —{' '}
                {expenseToDelete.category ?? 'Uncategorised'}
                {expenseToDelete.receipt_url ? ', and its receipt' : ''}.
              </p>
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
