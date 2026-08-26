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

/** Statuses that freeze a row for everyone except an admin. */
const FROZEN_STATUSES: readonly string[] = ['approved', 'denied'];

/**
 * A decided expense is the record of that decision, not a draft: once an admin
 * has approved or denied it, only an admin may change it. `pending` and
 * `needs_more_info` stay editable so the author can answer a reviewer.
 */
export function isFrozen(expense: ExpenseResource): boolean {
  return FROZEN_STATUSES.includes(expense.status);
}

/** Why a frozen row was refused, worded for the status that froze it. */
export function frozenReason(
  expense: ExpenseResource,
  verb: 'edited' | 'deleted',
): string {
  const state = expense.status === 'denied' ? 'Denied' : 'Approved';
  return `${state} expenses can only be ${verb} by an administrator`;
}
