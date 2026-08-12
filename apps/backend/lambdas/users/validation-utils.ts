// Result type for input validation operations
export type ValidationResult<T> = {
  isValid: boolean;
  value?: T;
  error?: string;
};

// Utility class for validating user-related input fields.
export class UserValidationUtils {
  static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Validates email - if provided, must be a correctly formatted string
  static validateEmail(input: unknown): ValidationResult<string | null> {
    if (input === undefined || input === null || input === '') {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'string') {
      return { isValid: false, error: 'email must be a string' };
    }
    if (!this.EMAIL_REGEX.test(input)) {
      return { isValid: false, error: 'Invalid email format' };
    }
    // email is the Cognito username and is looked up lowercased elsewhere
    return { isValid: true, value: input.trim().toLowerCase() };
  }

  // Validates name - if provided, must be a non-empty string
  static validateName(input: unknown): ValidationResult<string | null> {
    if (input === undefined || input === null) {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'string' || input.trim().length === 0) {
      return { isValid: false, error: 'name must be a non-empty string' };
    }
    return { isValid: true, value: input };
  }

  // Validates isAdmin - if provided, must be a boolean
  static validateIsAdmin(input: unknown): ValidationResult<boolean | null> {
    if (input === undefined || input === null) {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'boolean') {
      return { isValid: false, error: 'isAdmin must be a boolean' };
    }
    return { isValid: true, value: input };
  }

  // Validates profileImage - if provided, must be a string
  static validateProfileImage(input: unknown): ValidationResult<string | null> {
    if (input === undefined || input === null) {
      return { isValid: true, value: null };
    }
    if (typeof input !== 'string') {
      return { isValid: false, error: 'profileImage must be a string' };
    }
    return { isValid: true, value: input };
  }
}
