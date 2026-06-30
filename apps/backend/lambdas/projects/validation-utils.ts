// Result type for input validation operations
export type ValidationResult<T> = {
  isValid: boolean;
  value?: T;
  error?: string;
};

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
