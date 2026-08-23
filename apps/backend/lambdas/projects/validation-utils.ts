import { DEFAULT_PROJECT_ROLE, PROJECT_ROLES, type ProjectRole } from '@branch/rbac';

/**
 * Re-exported, not redeclared: `@branch/rbac` owns the role vocabulary because
 * its director derivation reads it. The DB check constraint still accepts the
 * legacy PI/Accountant/Staff values during the expand phase, but nothing writes
 * them.
 */
export { DEFAULT_PROJECT_ROLE, PROJECT_ROLES, type ProjectRole };

// Result type for input validation operations
export type ValidationResult<T> = {
  isValid: boolean;
  value?: T;
  error?: string;
};

/**
 * `role` is optional so "the staff picker sent me an id with no role" stays
 * distinguishable from "make this person a Student". `syncMemberships` keeps an
 * existing member's current role when it is absent, which is what stops an
 * ordinary project edit from demoting the project's directors.
 */
export type MemberAssignment = { user_id: number; role?: ProjectRole };

/**
 * A pending or denied expenditure is a request, not a spend. Every total,
 * chart series and budget percentage filters on this; the raw lists do not,
 * because their job is to show what is still awaiting review.
 */
export const APPROVED_EXPENDITURE_STATUS = 'approved';

// Utility class for validating project-related input fields
export class ProjectValidationUtils {
  // Parses numeric input (number or string), converts to fixed 2-decimal string for database storage
  static parseNumericToFixed(input: unknown): string | null | 'INVALID' {
    if (input === undefined || input === null || input === '') return null;
    let numeric: number;
    if (typeof input === 'number') {
      numeric = input;
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed === '') return null;
      numeric = Number(trimmed);
    } else {
      numeric = NaN;
    }
    if (!Number.isFinite(numeric)) return 'INVALID';
    return numeric.toFixed(2);
  }

  // Validates if a string matches YYYY-MM-DD date format
  static isValidDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  // Validates that name is a non-empty string (required field)
  static validateName(input: unknown): ValidationResult<string> {
    if (typeof input !== 'string') {
      return { isValid: false, error: "'name' is required" };
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return { isValid: false, error: "'name' is required" };
    }
    return { isValid: true, value: trimmed };
  }

  // Validates optional date field - if provided, must be YYYY-MM-DD format
  static validateDate(input: unknown, fieldName: string): ValidationResult<string | null> {
    if (input === undefined || input === null || input === '') {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'string') {
      return { isValid: true, value: null };
    }
    if (!this.isValidDate(input)) {
      return { isValid: false, error: `'${fieldName}' must be YYYY-MM-DD` };
    }
    return { isValid: true, value: input };
  }

  // Validates optional currency field - if provided, must be 1-10 characters
  static validateCurrency(input: unknown): ValidationResult<string | null> {
    if (input === undefined || input === null) {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'string') {
      return { isValid: true, value: null };
    }
    const c = input.trim();
    if (c.length === 0) {
      return { isValid: false, error: "'currency' must be 1-10 chars" };
    }
    if (c.length > 10) {
      return { isValid: false, error: "'currency' must be 1-10 chars" };
    }
    return { isValid: true, value: c };
  }

  // validates description field - required, defaults to empty string if not provided
  static validateDescription(input: unknown): ValidationResult<string> {
    if (input === undefined || input === null || input === '') {
      return { isValid: true, value: '' };
    }
    if (typeof input !== 'string') {
      return { isValid: true, value: '' };
    }
    const d = input.trim();
    if (d.length > 1000) {
      return { isValid: false, error: "'description' must be <= 1000 chars" };
    }
    return { isValid: true, value: d.length === 0 ? '' : d };
  }
  /**
   * Accepts `[1, 2]` or `[{ user_id: 1, role: 'Director' }]`, so the project
   * form can post bare ids while a future admin tool can still set roles.
   *
   * `undefined` (key absent) means "leave memberships alone" and `[]` means
   * "remove everyone" — callers must keep those apart, which is why this
   * resolves to `undefined` rather than defaulting to an empty array.
   */
  static validateMembers(input: unknown): ValidationResult<MemberAssignment[] | undefined> {
    if (input === undefined || input === null) return { isValid: true, value: undefined };
    if (!Array.isArray(input)) {
      return { isValid: false, error: "'members' must be an array" };
    }

    const members: MemberAssignment[] = [];

    for (const entry of input) {
      const isObject = typeof entry === 'object' && entry !== null;
      const rawId = isObject ? (entry as Record<string, unknown>).user_id : entry;
      const userId =
        typeof rawId === 'string' && /^\d+$/.test(rawId.trim()) ? Number(rawId.trim()) : rawId;

      if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
        return { isValid: false, error: "'members' must contain positive integer user ids" };
      }

      const rawRole = isObject ? (entry as Record<string, unknown>).role : undefined;
      if (rawRole !== undefined && !PROJECT_ROLES.includes(rawRole as ProjectRole)) {
        return { isValid: false, error: `'role' must be one of: ${PROJECT_ROLES.join(', ')}` };
      }
      // Left undefined when the request did not say. Resolving it to a default
      // here would erase the difference between "unspecified" and "Student".
      const role = rawRole as ProjectRole | undefined;

      // A repeated id is a UI race, not a client error, and the intent is
      // unambiguous — take the last role rather than rejecting the whole write.
      const existing = members.find((m) => m.user_id === userId);
      if (existing) existing.role = role;
      else members.push({ user_id: userId, role });
    }

    return { isValid: true, value: members };
  }

  /**
   * An end date before the start date inverts every duration derived from the
   * pair (and would render a negative project length), so it is rejected.
   */
  static validateDateRange(
    startDate: string | null | undefined,
    endDate: string | null | undefined,
  ): ValidationResult<null> {
    if (!startDate || !endDate) return { isValid: true, value: null };
    // Both are already validated as YYYY-MM-DD, which sorts lexicographically.
    if (endDate < startDate) {
      return { isValid: false, error: "'end_date' must be on or after 'start_date'" };
    }
    return { isValid: true, value: null };
  }

  static buildUpdateValues(body: Record<string, unknown>): { isValid: boolean; error?: string; values?: Record<string, unknown> } {
  const updateValues: Record<string, unknown> = {};

  if ('name' in body) {
    const nameResult = ProjectValidationUtils.validateName(body.name);
    if (!nameResult.isValid) return { isValid: false, error: nameResult.error };
    updateValues.name = nameResult.value;
  }

  if ('description' in body) {
    if (body.description === undefined || body.description === null) {
      updateValues.description = '';
    } else if (typeof body.description !== 'string') {
      return { isValid: false, error: "'description' must be a string" };
    } else {
      const description = body.description.trim();
      if (description.length > 1000) {
        return { isValid: false, error: "'description' must be <= 1000 chars" };
      }
      updateValues.description = description;
    }
  }

  if ('total_budget' in body) {
    const parsedBudget = ProjectValidationUtils.parseNumericToFixed(body.total_budget);
    if (parsedBudget === 'INVALID') return { isValid: false, error: "'total_budget' must be a number" };
    updateValues.total_budget = parsedBudget;
  }

  if ('currency' in body) {
    if (body.currency === undefined || body.currency === null) {
      updateValues.currency = null;
    } else if (typeof body.currency !== 'string') {
      return { isValid: false, error: "'currency' must be 1-10 chars" };
    } else {
      const currencyResult = ProjectValidationUtils.validateCurrency(body.currency);
      if (!currencyResult.isValid) return { isValid: false, error: currencyResult.error };
      updateValues.currency = currencyResult.value;
    }
  }

  if ('start_date' in body) {
    if (body.start_date === undefined || body.start_date === null || body.start_date === '') {
      updateValues.start_date = null;
    } else if (typeof body.start_date !== 'string' || !ProjectValidationUtils.isValidDate(body.start_date)) {
      return { isValid: false, error: "'start_date' must be YYYY-MM-DD" };
    } else {
      updateValues.start_date = body.start_date;
    }
  }

  if ('end_date' in body) {
    if (body.end_date === undefined || body.end_date === null || body.end_date === '') {
      updateValues.end_date = null;
    } else if (typeof body.end_date !== 'string' || !ProjectValidationUtils.isValidDate(body.end_date)) {
      return { isValid: false, error: "'end_date' must be YYYY-MM-DD" };
    } else {
      updateValues.end_date = body.end_date;
    }
  }

  return { isValid: true, values: updateValues };
}
}
