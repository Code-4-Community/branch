export const EXPENDITURE_STATUSES = ['pending', 'approved', 'needs_more_info'] as const;

export type ExpenditureStatus = typeof EXPENDITURE_STATUSES[number];

/** Figma labels the `needs_more_info` pill "Needs Info". */
export const EXPENDITURE_STATUS_LABELS: Record<ExpenditureStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  needs_more_info: 'Needs Info',
};

export interface Expenditure {
    expenditure_id: number;
    project_id: number;
    entered_by: number | null;
    amount: string;
    category: string | null;
    description: string | null;
    status: ExpenditureStatus;
    receipt_url: string | null;
    admin_notes: string | null;
    spent_on: string;
    created_at: string | null;
  };

/** Shape of GET /expenditures/{id}, which joins in the submitter and project. */
export interface ExpenditureDetail {
  expenditureId: number;
  projectId: number;
  projectName: string | null;
  enteredBy: number | null;
  submittedByName: string | null;
  amount: string;
  category: string | null;
  description: string | null;
  status: ExpenditureStatus;
  adminNotes: string | null;
  receiptUrl: string | null;
  spent_on: string;
  createdAt: string | null;
}
