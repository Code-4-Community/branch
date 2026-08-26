import { describe, expect, it } from '@jest/globals';
import { PROJECT_ROLES, ProjectValidationUtils } from '../validation-utils';

describe('validateMembers role vocabulary', () => {
  it('accepts every role the project may actually grant', () => {
    for (const role of PROJECT_ROLES) {
      const result = ProjectValidationUtils.validateMembers([
        { user_id: 1, role },
      ]);
      expect(result).toEqual({
        isValid: true,
        value: [{ user_id: 1, role }],
      });
    }
  });

  // Admin is users.is_admin, so accepting it here would let a project write
  // mint a role the policy has no meaning for.
  it('rejects Admin, which is not a membership role', () => {
    const result = ProjectValidationUtils.validateMembers([
      { user_id: 1, role: 'Admin' },
    ]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("'role' must be one of: Director, Student");
  });
});
