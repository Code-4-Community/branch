import type { AccessLevel, AuthContext, AuthorizationCheck } from './types';

export function checkAuthorization(
  authContext: AuthContext,
  requiredAccess: AccessLevel,
  resourceUserId?: number | string,
): AuthorizationCheck {
  if (requiredAccess === 'PUBLIC') {
    return { allowed: true };
  }

  if (!authContext.isAuthenticated || !authContext.user) {
    return { allowed: false, reason: 'Authentication required' };
  }

  const { user } = authContext;

  switch (requiredAccess) {
    case 'AUTHENTICATED':
      return { allowed: true };

    case 'ADMIN':
      if (!user.isAdmin) {
        return { allowed: false, reason: 'Admin access required' };
      }
      return { allowed: true };

    case 'SELF':
      if (!resourceUserId) {
        return {
          allowed: false,
          reason: 'Resource user ID required for SELF access check',
        };
      }
      if (user.userId !== Number(resourceUserId)) {
        return { allowed: false, reason: 'Can only access own resources' };
      }
      return { allowed: true };

    case 'ADMIN_OR_SELF':
      if (!resourceUserId) {
        return {
          allowed: false,
          reason: 'Resource user ID required for ADMIN_OR_SELF access check',
        };
      }
      if (user.isAdmin || user.userId === Number(resourceUserId)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Admin access or resource ownership required',
      };

    default:
      return { allowed: false, reason: 'Unknown access level' };
  }
}
