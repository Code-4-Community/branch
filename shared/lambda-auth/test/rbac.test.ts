import { ANONYMOUS } from '@branch/rbac';
import type { AuthContext } from '../src/types';
import { loadRbacSubject, preloadedSubject } from '../src/rbac';

/** Kysely-shaped stub for the memberships fallback query. */
function makeDb(rows: unknown[]) {
  const execute = jest.fn().mockResolvedValue(rows);
  const db = {
    selectFrom: () => ({
      where: () => ({ select: () => ({ execute }) }),
    }),
  };
  return { db, execute };
}

const context = (over: Partial<NonNullable<AuthContext['user']>> = {}): AuthContext => ({
  isAuthenticated: true,
  user: { cognitoSub: 'sub-1', userId: 7, isAdmin: false, ...over },
});

describe('preloadedSubject', () => {
  it('builds the subject from memberships the identity query already fetched', () => {
    const subject = preloadedSubject(
      context({
        memberships: [
          { project_id: 1, role: 'Director' },
          { project_id: 2, role: 'Student' },
        ],
      }),
    );

    expect(subject).toEqual({
      userId: 7,
      isAdmin: false,
      memberProjectIds: [1, 2],
      directorProjectIds: [1],
    });
  });

  it('treats an empty array as "member of nothing", not as "not loaded"', () => {
    // A user with no memberships still authenticates (the join is LEFT), and
    // must not trigger a second query to rediscover that.
    expect(preloadedSubject(context({ memberships: [] }))).toEqual({
      userId: 7,
      isAdmin: false,
      memberProjectIds: [],
      directorProjectIds: [],
    });
  });

  it('returns null when memberships were never loaded', () => {
    expect(preloadedSubject(context())).toBeNull();
  });

  it('returns null for an unauthenticated or id-less context', () => {
    expect(preloadedSubject({ isAuthenticated: false })).toBeNull();
    expect(
      preloadedSubject({
        isAuthenticated: true,
        user: { cognitoSub: 'sub-1', isAdmin: false, memberships: [] },
      }),
    ).toBeNull();
  });
});

describe('loadRbacSubject', () => {
  it('costs no query when authentication already joined the memberships in', async () => {
    const { db, execute } = makeDb([]);

    const subject = await loadRbacSubject(
      db,
      context({ memberships: [{ project_id: 4, role: 'Director' }] }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(subject.memberProjectIds).toEqual([4]);
    expect(subject.directorProjectIds).toEqual([4]);
  });

  it('queries when handed a context that carries no memberships', async () => {
    const { db, execute } = makeDb([{ project_id: 9, role: 'Student' }]);

    const subject = await loadRbacSubject(db, context());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(subject.memberProjectIds).toEqual([9]);
  });

  it('is ANONYMOUS, and silent, for an unauthenticated caller', async () => {
    const { db, execute } = makeDb([]);

    await expect(loadRbacSubject(db, { isAuthenticated: false })).resolves.toBe(ANONYMOUS);
    expect(execute).not.toHaveBeenCalled();
  });
});
