import { ANONYMOUS, type RbacSubject } from '@branch/rbac';

/**
 * Subject builders for tests.
 *
 * A component now asks `@branch/rbac` rather than reading `isAdmin`, so a mocked
 * session needs a subject or every control renders denied. These exist so no
 * test hand-rolls the four-field shape and quietly forgets `directorProjectIds`.
 */

export function subjectFor(
  partial: Partial<RbacSubject> & { userId: number },
): RbacSubject {
  return {
    isAdmin: false,
    memberProjectIds: [],
    directorProjectIds: [],
    ...partial,
  };
}

export const adminSubject = (userId = 1): RbacSubject =>
  subjectFor({ userId, isAdmin: true });

/** A director of `projectIds` — also a member of them, as the DB guarantees. */
export const directorSubject = (projectIds: number[] = [1], userId = 2): RbacSubject =>
  subjectFor({ userId, memberProjectIds: projectIds, directorProjectIds: projectIds });

export const memberSubject = (projectIds: number[] = [1], userId = 3): RbacSubject =>
  subjectFor({ userId, memberProjectIds: projectIds });

export const anonymousSubject = ANONYMOUS;

/** The `useAuth()` value a mocked session should return. */
export function session({
  subject = ANONYMOUS,
  isAuthenticated = subject !== ANONYMOUS,
  isLoading = false,
}: {
  subject?: RbacSubject;
  isAuthenticated?: boolean;
  isLoading?: boolean;
} = {}) {
  return {
    isAuthenticated,
    isLoading,
    isAdmin: subject.isAdmin,
    subject,
    user: isAuthenticated
      ? {
          userId: subject.userId ?? 1,
          cognitoSub: 'sub',
          email: 'person@branch.org',
          name: 'Test Person',
          isAdmin: subject.isAdmin,
          rbac: subject,
        }
      : null,
  };
}
