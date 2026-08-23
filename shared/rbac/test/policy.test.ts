import { describe, expect, it } from '@jest/globals';
import {
  ACTIONS,
  ANONYMOUS,
  Action,
  RbacSubject,
  authorize,
  can,
  isDirector,
  pagePermission,
  visibleProjectIds,
} from '../src';

// Project 1 is the director's; project 2 is the student's. Nobody is a member
// of project 3, so it doubles as "someone else's project".
const ADMIN: RbacSubject = {
  userId: 1,
  isAdmin: true,
  memberProjectIds: [],
  directorProjectIds: [],
};
const DIRECTOR: RbacSubject = {
  userId: 2,
  isAdmin: false,
  memberProjectIds: [1],
  directorProjectIds: [1],
};
const STUDENT: RbacSubject = {
  userId: 3,
  isAdmin: false,
  memberProjectIds: [2],
  directorProjectIds: [],
};

const OWN_PROJECT = { projectId: 2 };
const OTHER_PROJECT = { projectId: 3 };

const pendingOwn = { projectId: 2, enteredBy: 3, status: 'pending' };
const approvedOwn = { projectId: 2, enteredBy: 3, status: 'approved' };
const pendingOther = { projectId: 2, enteredBy: 99, status: 'pending' };

describe('subject helpers', () => {
  it('derives director from memberships, not a global flag', () => {
    expect(isDirector(DIRECTOR)).toBe(true);
    expect(isDirector(STUDENT)).toBe(false);
    expect(isDirector(ADMIN)).toBe(false);
  });

  it('scopes list queries to memberships, unrestricted for admins', () => {
    expect(visibleProjectIds(ADMIN)).toBe('all');
    expect(visibleProjectIds(STUDENT)).toEqual([2]);
    expect(visibleProjectIds(ANONYMOUS)).toEqual([]);
  });
});

describe('anonymous callers', () => {
  it('are denied every action', () => {
    for (const action of ACTIONS) {
      const decision = (authorize as any)(ANONYMOUS, action, {
        projectId: 1,
        userId: 1,
        enteredBy: null,
        status: 'pending',
      });
      expect([action, decision.allowed]).toEqual([action, false]);
    }
  });

  it('are treated the same as a missing subject', () => {
    expect(can(null, 'projects:view')).toBe(false);
    expect(can(undefined, 'dashboard:view')).toBe(false);
  });
});

describe('admins', () => {
  it('are allowed every action', () => {
    for (const action of ACTIONS) {
      const decision = (authorize as any)(ADMIN, action, {
        projectId: 3,
        userId: 999,
        enteredBy: 999,
        status: 'approved',
      });
      expect([action, decision.allowed]).toEqual([action, true]);
    }
  });
});

describe('donors', () => {
  it('is readable by admins and directors only', () => {
    expect(can(ADMIN, 'donors:view')).toBe(true);
    expect(can(DIRECTOR, 'donors:view')).toBe(true);
    expect(can(STUDENT, 'donors:view')).toBe(false);
  });

  it('is writable by admins only', () => {
    expect(can(DIRECTOR, 'donors:create')).toBe(false);
    expect(can(DIRECTOR, 'donors:delete')).toBe(false);
  });
});

describe('donations', () => {
  it('is readable per project membership', () => {
    expect(can(STUDENT, 'donation:view', OWN_PROJECT)).toBe(true);
    expect(can(STUDENT, 'donation:view', OTHER_PROJECT)).toBe(false);
    expect(can(ADMIN, 'donation:view', OTHER_PROJECT)).toBe(true);
  });

  it('is writable by admins only', () => {
    expect(can(DIRECTOR, 'donations:create')).toBe(false);
    expect(can(DIRECTOR, 'donations:delete')).toBe(false);
  });
});

describe('expenses', () => {
  it('lets a member file against their own project only', () => {
    expect(can(STUDENT, 'expense:create', OWN_PROJECT)).toBe(true);
    expect(can(STUDENT, 'expense:create', OTHER_PROJECT)).toBe(false);
  });

  it('lets the author edit their own pending expense', () => {
    expect(can(STUDENT, 'expense:update', pendingOwn)).toBe(true);
  });

  it('freezes an approved expense for everyone but an admin', () => {
    const denied = authorize(STUDENT, 'expense:update', approvedOwn);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/Approved expenses/);
    expect(can(ADMIN, 'expense:update', approvedOwn)).toBe(true);
    expect(can(STUDENT, 'expense:delete', approvedOwn)).toBe(false);
  });

  it('does not let a member edit someone else expense', () => {
    expect(can(STUDENT, 'expense:update', pendingOther)).toBe(false);
    expect(can(DIRECTOR, 'expense:update', pendingOwn)).toBe(false);
  });

  it('lets a project member read expenses on that project', () => {
    expect(can(STUDENT, 'expense:view', pendingOther)).toBe(true);
    expect(can(DIRECTOR, 'expense:view', pendingOther)).toBe(false);
  });

  it('lets the author read an expense they filed on a project they left', () => {
    expect(
      can(STUDENT, 'expense:view', { projectId: 3, enteredBy: 3, status: 'pending' }),
    ).toBe(true);
  });

  it('reserves review and admin notes for admins', () => {
    expect(can(DIRECTOR, 'expense:review')).toBe(false);
    expect(can(STUDENT, 'expense:viewAdminNotes')).toBe(false);
    expect(can(ADMIN, 'expense:review')).toBe(true);
  });
});

describe('profile', () => {
  it('is self-only', () => {
    expect(can(STUDENT, 'profile:view', { userId: 3 })).toBe(true);
    expect(can(STUDENT, 'profile:update', { userId: 3 })).toBe(true);
    expect(can(STUDENT, 'profile:update', { userId: 2 })).toBe(false);
  });
});

describe('projects', () => {
  it('is readable per membership', () => {
    expect(can(DIRECTOR, 'project:view', { projectId: 1 })).toBe(true);
    expect(can(DIRECTOR, 'project:view', OTHER_PROJECT)).toBe(false);
  });

  it('is modifiable by admins only, directors included in the denial', () => {
    for (const action of [
      'project:create',
      'project:update',
      'project:delete',
      'project:manageMembers',
      'staff:list',
    ] as Action[]) {
      expect([action, can(DIRECTOR, action as never)]).toEqual([action, false]);
    }
  });
});

describe('admin-only areas', () => {
  it('locks reports, the dashboard and accounts', () => {
    for (const action of [
      'reports:view',
      'reports:create',
      'reports:generate',
      'reports:delete',
      'dashboard:view',
      'accounts:view',
      'accounts:create',
      'accounts:update',
      'accounts:delete',
    ] as Action[]) {
      expect([action, can(DIRECTOR, action as never)]).toEqual([action, false]);
      expect([action, can(STUDENT, action as never)]).toEqual([action, false]);
    }
  });
});

describe('fail-closed behaviour', () => {
  it('denies a scoped action called without its resource', () => {
    expect((authorize as any)(STUDENT, 'expense:update').allowed).toBe(false);
    expect((authorize as any)(ADMIN, 'project:view').allowed).toBe(false);
  });

  it('denies an unknown action', () => {
    expect((authorize as any)(ADMIN, 'nope:nope').allowed).toBe(false);
  });

  it('always attaches a reason to a denial', () => {
    for (const action of ACTIONS) {
      const decision = (authorize as any)(ANONYMOUS, action);
      expect([action, typeof decision.reason]).toEqual([action, 'string']);
    }
  });
});

describe('page permissions', () => {
  it('maps every guarded page to an action in the policy', () => {
    for (const path of ['/dashboard', '/donors', '/donations', '/expenses', '/projects', '/reports', '/accounts']) {
      const action = pagePermission(path);
      expect([path, action && ACTIONS.includes(action)]).toEqual([path, true]);
    }
  });

  it('matches descendant segments', () => {
    expect(pagePermission('/reports/archive')).toBe('reports:view');
  });

  it('returns undefined for pages that need only a session', () => {
    expect(pagePermission('/profile')).toBeUndefined();
  });
});
