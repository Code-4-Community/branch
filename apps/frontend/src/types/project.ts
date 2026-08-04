export interface Project {
    project_id: number;
    name: string;
    description: string;
    total_budget: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string | null;
    created_at: string | null;
};

/** A project as `GET /projects/dashboard` returns it: the row plus its aggregates. */
export interface ProjectSummary {
    project_id: number;
    name: string;
    total_budget: number | null;
    currency: string | null;
    spent: number;
    staff_count: number;
    spent_percentage: number;
}

export interface Dashboard {
    summary: {
        topExpenseCategory: { category: string; amount: number } | null;
        totalSpent: number;
        totalProjects: number;
        averageSpendPerProject: number;
    };
    projects: ProjectSummary[];
    expensesByMonth: { month: string; category: string; amount: number }[];
}

export type ProjectRole = 'PI' | 'Accountant' | 'Staff' | 'Admin';

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: ProjectRole;
}