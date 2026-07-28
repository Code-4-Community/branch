import { checkAuthorization } from '../src/authorize';
import type { AccessLevel, AuthContext } from '../src/types';

const anonymous: AuthContext = { isAuthenticated: false };

const nonAdmin: AuthContext = {
  isAuthenticated: true,
  user: { cognitoSub: 'sub-3', userId: 3, isAdmin: false },
};

const admin: AuthContext = {
  isAuthenticated: true,
  user: { cognitoSub: 'sub-1', userId: 1, isAdmin: true },
};

describe('checkAuthorization', () => {
  describe('PUBLIC', () => {
    it('allows anonymous callers', () => {
      expect(checkAuthorization(anonymous, 'PUBLIC')).toEqual({ allowed: true });
    });

    it('allows authenticated callers', () => {
      expect(checkAuthorization(nonAdmin, 'PUBLIC')).toEqual({ allowed: true });
    });
  });

  describe('anonymous callers', () => {
    const gated: AccessLevel[] = ['AUTHENTICATED', 'ADMIN', 'SELF', 'ADMIN_OR_SELF'];

    it.each(gated)('denies %s with "Authentication required"', (level) => {
      expect(checkAuthorization(anonymous, level, 3)).toEqual({
        allowed: false,
        reason: 'Authentication required',
      });
    });

    it('denies a context flagged authenticated but carrying no user', () => {
      const malformed = { isAuthenticated: true } as AuthContext;
      expect(checkAuthorization(malformed, 'AUTHENTICATED').allowed).toBe(false);
    });
  });

  describe('AUTHENTICATED', () => {
    it('allows any signed-in user', () => {
      expect(checkAuthorization(nonAdmin, 'AUTHENTICATED')).toEqual({ allowed: true });
    });
  });

  describe('ADMIN', () => {
    it('allows admins', () => {
      expect(checkAuthorization(admin, 'ADMIN')).toEqual({ allowed: true });
    });

    it('denies non-admins', () => {
      expect(checkAuthorization(nonAdmin, 'ADMIN')).toEqual({
        allowed: false,
        reason: 'Admin access required',
      });
    });
  });

  describe('SELF', () => {
    it('allows a user acting on their own id', () => {
      expect(checkAuthorization(nonAdmin, 'SELF', 3)).toEqual({ allowed: true });
    });

    it('coerces a string resourceUserId, so "3" matches userId 3', () => {
      expect(checkAuthorization(nonAdmin, 'SELF', '3')).toEqual({ allowed: true });
    });

    it('denies a user acting on someone else', () => {
      expect(checkAuthorization(nonAdmin, 'SELF', 4)).toEqual({
        allowed: false,
        reason: 'Can only access own resources',
      });
    });

    it('does NOT let an admin through — SELF means self, even for admins', () => {
      expect(checkAuthorization(admin, 'SELF', 4).allowed).toBe(false);
    });

    it('denies when resourceUserId is omitted', () => {
      expect(checkAuthorization(nonAdmin, 'SELF')).toEqual({
        allowed: false,
        reason: 'Resource user ID required for SELF access check',
      });
    });

    it('treats resourceUserId 0 as missing, because the guard is falsy-based', () => {
      // user_id is SERIAL and starts at 1, so 0 is unreachable today. This pins
      // current behaviour: 0 takes the "required" branch rather than comparing.
      expect(checkAuthorization(nonAdmin, 'SELF', 0).reason).toBe(
        'Resource user ID required for SELF access check',
      );
    });

    it('denies a non-numeric resourceUserId (NaN never equals userId)', () => {
      expect(checkAuthorization(nonAdmin, 'SELF', 'abc').allowed).toBe(false);
    });
  });

  describe('ADMIN_OR_SELF', () => {
    it('allows the owner', () => {
      expect(checkAuthorization(nonAdmin, 'ADMIN_OR_SELF', 3)).toEqual({ allowed: true });
    });

    it('allows an admin acting on someone else', () => {
      expect(checkAuthorization(admin, 'ADMIN_OR_SELF', 99)).toEqual({ allowed: true });
    });

    it('denies a non-admin acting on someone else', () => {
      expect(checkAuthorization(nonAdmin, 'ADMIN_OR_SELF', 4)).toEqual({
        allowed: false,
        reason: 'Admin access or resource ownership required',
      });
    });

    it('denies when resourceUserId is omitted, even for an admin', () => {
      expect(checkAuthorization(admin, 'ADMIN_OR_SELF')).toEqual({
        allowed: false,
        reason: 'Resource user ID required for ADMIN_OR_SELF access check',
      });
    });
  });

  it('denies an unrecognised access level', () => {
    expect(checkAuthorization(admin, 'SUPERUSER' as AccessLevel)).toEqual({
      allowed: false,
      reason: 'Unknown access level',
    });
  });
});
