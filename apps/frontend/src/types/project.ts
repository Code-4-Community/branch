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

export type ProjectRole = 'PI' | 'Accountant' | 'Staff' | 'Admin';

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: ProjectRole;
}