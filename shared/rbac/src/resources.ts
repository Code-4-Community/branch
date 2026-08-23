/**
 * Resource shapes the policy may inspect.
 *
 * Each is the minimum set of columns a rule needs, not the row type — so a
 * caller can build one from a partial select, and so the browser can pass the
 * same shape it already renders.
 */

export interface ProjectResource {
  projectId: number;
}

/** Statuses in `branch.expenditures.status`. */
export type ExpenseStatus = 'pending' | 'approved' | 'denied' | 'needs_more_info';

export interface ExpenseResource {
  projectId: number;
  /** `branch.expenditures.entered_by`; null for rows whose author was deleted. */
  enteredBy: number | null;
  status: ExpenseStatus | string;
}

export interface DonationResource {
  projectId: number;
}

export interface UserResource {
  userId: number;
}

/** An approved expense is frozen for everyone except an admin. */
export function isFrozen(expense: ExpenseResource): boolean {
  return expense.status === 'approved';
}
