export type ValidationResult<T> = {
  isValid: boolean;
  value?: T;
  error?: string;
};

export class ProjectValidationUtils {
  static parseNumericToFixed2(input: unknown): string | null | 'INVALID' {
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

  static isValidDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

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
}
