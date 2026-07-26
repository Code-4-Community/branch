export interface Expenditure {
    expenditure_id: number;
    project_id: number;
    entered_by: number | null;
    amount: string;
    category: string | null;
    description: string | null;
    spent_on: string;
    created_at: string | null;
  };