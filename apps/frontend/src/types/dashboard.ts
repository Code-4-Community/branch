/** Shape of `GET /projects/dashboard` (admin only). */

export interface DashboardTopCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface DashboardSummary {
  /** Null when nothing has been spent in `year`. */
  topExpenseCategory: DashboardTopCategory | null;
  totalSpent: number;
  totalProjects: number;
  averageSpendPerProject: number;
}

export interface DashboardProject {
  project_id: number;
  name: string;
  total_budget: number | null;
  currency: string | null;
  spent: number;
  staff_count: number;
  spent_percentage: number;
}

export interface DashboardMonthlyExpense {
  /** `YYYY-MM`. Only months with expenditures are present. */
  month: string;
  category: string;
  amount: number;
}

export interface DashboardResponse {
  /** Calendar year the spend aggregates cover. */
  year: number;
  summary: DashboardSummary;
  projects: DashboardProject[];
  expensesByMonth: DashboardMonthlyExpense[];
}
