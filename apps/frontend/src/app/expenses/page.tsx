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
import { apiFetch } from '@/lib/api';
import { CiFilter } from 'react-icons/ci';
import { LuArrowDownUp } from 'react-icons/lu';
import { FaPlus } from 'react-icons/fa';
import ExpensesTable from '../components/ExpensesTable';

type Expenditure = {
  expenditure_id: number;
  project_id: number;
  entered_by: number | null;
  amount: string;
  category: string | null;
  description: string | null;
  spent_on: string;
  created_at: string | null;
};

type Project = {
  project_id: number;
  name: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SORT_OPTIONS = ['Amount', 'Date'];
const ROWS_PER_PAGE = 10;

export const EXPENSE_CATEGORIES = [
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
  // Data
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters (synced to URL query params)
  const [filters, setFilter] = useQueryParams({
    q: '',
    months: [] as string[],
    types: [] as string[],
    projects: [] as string[],
    sort: '',
    page: '',
  });

  const query = filters.q;
  const selectedMonths = filters.months;
  const selectedTypes = filters.types;
  const selectedProjects = filters.projects;
  const sortOption = filters.sort;
  const currentPage = parseInt(filters.page, 10) || 1;

  // Dropdown visibility
  const [showMonthFilter, setShowMonthFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showProjectFilter, setShowProjectFilter] = useState(false);
  const [showSortBy, setShowSortBy] = useState(false);

  // Modal
  const [showNewExpense, setShowNewExpense] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('branch_access_token') ?? '' : '';

  // Fetch expenditures
  async function fetchExpenditures() {
    try {
      const json = await apiFetch<{ data: Expenditure[] }>('/expenditures', { token });
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
      const json = await apiFetch<Project[]>('/projects', { token });
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
      <NavBar role="admin" />
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
            <HStack width="30%">
              <Input
                placeholder="Search ..."
                variant="outline"
                value={query}
                onChange={(e) => setFilter({ q: e.target.value, page: '' })}
              />
            </HStack>
            <HStack>
              {/* Project Filter */}
              <div style={{ position: 'relative' }}>
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  onClick={() => {
                    setShowProjectFilter((prev) => !prev);
                    setShowMonthFilter(false);
                    setShowTypeFilter(false);
                    setShowSortBy(false);
                  }}
                >
                  <CiFilter />
                  Project
                </Button>
                {showProjectFilter && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={projects.map((p) => p.name)}
                      multiSelect={true}
                      hideTrigger={true}
                      value={selectedProjects}
                      onChange={(val) => setFilter({ projects: Array.isArray(val) ? val : [val], page: '' })}
                    />
                  </div>
                )}
              </div>

              {/* Month Filter */}
              <div style={{ position: 'relative' }}>
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  onClick={() => {
                    setShowMonthFilter((prev) => !prev);
                    setShowProjectFilter(false);
                    setShowTypeFilter(false);
                    setShowSortBy(false);
                  }}
                >
                  <CiFilter />
                  Month
                </Button>
                {showMonthFilter && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={MONTHS}
                      multiSelect={true}
                      hideTrigger={true}
                      value={selectedMonths}
                      onChange={(val) => setFilter({ months: Array.isArray(val) ? val : [val], page: '' })}
                    />
                  </div>
                )}
              </div>

              {/* Type Filter */}
              <div style={{ position: 'relative' }}>
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  onClick={() => {
                    setShowTypeFilter((prev) => !prev);
                    setShowProjectFilter(false);
                    setShowMonthFilter(false);
                    setShowSortBy(false);
                  }}
                >
                  <CiFilter />
                  Type
                </Button>
                {showTypeFilter && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={uniqueCategories}
                      multiSelect={true}
                      hideTrigger={true}
                      value={selectedTypes}
                      onChange={(val) => setFilter({ types: Array.isArray(val) ? val : [val], page: '' })}
                    />
                  </div>
                )}
              </div>

              {/* Sort By */}
              <div style={{ position: 'relative' }}>
                <Button
                  backgroundColor="var(--color-core-white)"
                  color="var(--color-core-black)"
                  border="1px solid"
                  borderColor="var(--color-black-500)"
                  onClick={() => {
                    setShowSortBy((prev) => !prev);
                    setShowProjectFilter(false);
                    setShowMonthFilter(false);
                    setShowTypeFilter(false);
                  }}
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
              <Button
                backgroundColor="var(--color-core-green)"
                color="var(--color-core-white)"
                onClick={() => setShowNewExpense(true)}
              >
                <FaPlus />
                New Expense
              </Button>
            </HStack>
          </HStack>

          {/* Loading / Error */}
          {loading && <p>Loading expenditures...</p>}
          {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}

          {/* Table */}
          {!loading && !error && (
            <ExpensesTable expenditures={paginatedData} showDescription={true} />
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
          token={token}
          categories={uniqueCategories}
          projects={projects}
        />
      </main>
    </div>
  );
}
