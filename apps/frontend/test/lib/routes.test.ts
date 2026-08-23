import {
  ADMIN_LANDING_PATH,
  DEFAULT_LANDING_PATH,
  LOGIN_PATH,
  classifyRoute,
  landingPathFor,
  normalizePath,
  pagePermission,
  safeNextPath,
} from '@/lib/routes';
import { can } from '@branch/rbac';
import { adminSubject, anonymousSubject, directorSubject, memberSubject } from '../rbac';

describe('normalizePath', () => {
  it.each([
    ['/login', '/login'],
    // next.config.ts sets trailingSlash: true, so production paths look like this.
    ['/login/', '/login'],
    ['/Expenses/', '/expenses'],
    ['/', '/'],
    ['', '/'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('classifyRoute', () => {
  it('treats the root as the bootstrap route', () => {
    expect(classifyRoute('/')).toBe('bootstrap');
  });

  it.each(['/login', '/login/', '/forgot-password', '/reset-password'])(
    'treats %s as public',
    (path) => {
      expect(classifyRoute(path)).toBe('public');
    },
  );

  it.each(['/dashboard', '/expenses/', '/projects/7', '/donors', '/accounts'])(
    'treats %s as protected',
    (path) => {
      expect(classifyRoute(path)).toBe('protected');
    },
  );

  it('is protected-by-default for a route nobody has thought about yet', () => {
    // This is the property that keeps the original bug from recurring: a new
    // page under src/app/ is guarded without anyone opting in.
    expect(classifyRoute('/some-brand-new-page')).toBe('protected');
  });

  it('does not treat a lookalike prefix as public', () => {
    expect(classifyRoute('/login-help')).toBe('protected');
  });
});

/** Would this subject be let into this page by AuthGate? */
function reaches(subject: Parameters<typeof can>[0], path: string): boolean {
  const required = pagePermission(path);
  return required === undefined || (can as (s: typeof subject, a: typeof required) => boolean)(subject, required);
}

describe('pagePermission', () => {
  it.each([
    ['/dashboard', 'dashboard:view'],
    ['/dashboard/', 'dashboard:view'],
    ['/reports/', 'reports:view'],
    ['/accounts', 'accounts:view'],
    ['/donors', 'donors:view'],
    ['/expenses', 'expenses:view'],
    ['/projects/7', 'projects:view'],
  ])('maps %s to %s', (path, action) => {
    expect(pagePermission(path)).toBe(action);
  });

  it('does not match a lookalike prefix', () => {
    expect(pagePermission('/reports-archive')).toBeUndefined();
  });

  it.each(['/dashboard', '/dashboard/', '/reports/', '/accounts'])(
    'keeps %s admin-only',
    (path) => {
      expect(reaches(adminSubject(), path)).toBe(true);
      expect(reaches(directorSubject(), path)).toBe(false);
      expect(reaches(memberSubject(), path)).toBe(false);
    },
  );

  it('opens /donors to admins and directors but not to students', () => {
    expect(reaches(adminSubject(), '/donors')).toBe(true);
    expect(reaches(directorSubject(), '/donors')).toBe(true);
    expect(reaches(memberSubject(), '/donors')).toBe(false);
  });

  // Non-admins submit expenses and read their own projects, so these pages are
  // reachable by anyone signed in; the rows and controls inside are scoped.
  it.each(['/projects/7', '/expenses', '/expenses/123', '/donations'])(
    'lets any signed-in user reach %s',
    (path) => {
      expect(reaches(memberSubject(), path)).toBe(true);
    },
  );

  it('lets nobody through while signed out', () => {
    for (const path of ['/dashboard', '/donors', '/expenses', '/projects']) {
      expect(reaches(anonymousSubject, path)).toBe(false);
    }
  });
});

describe('landingPathFor', () => {
  it('sends an admin to the dashboard', () => {
    expect(landingPathFor(true)).toBe(ADMIN_LANDING_PATH);
  });

  it('sends everyone else somewhere they can actually load', () => {
    // Regression guard: the landing route was /dashboard for every role, so
    // making the dashboard admin-only dropped non-admins on the no-access panel
    // the instant they signed in.
    expect(landingPathFor(false)).toBe(DEFAULT_LANDING_PATH);
    expect(reaches(memberSubject(), DEFAULT_LANDING_PATH)).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('accepts a same-origin path with a query string', () => {
    expect(safeNextPath('/expenses?page=2')).toBe('/expenses?page=2');
  });

  const unsafe: Array<[string | null, string]> = [
    ['//evil.example.com', 'protocol-relative URL'],
    ['https://evil.example.com', 'absolute URL'],
    ['http://evil.example.com', 'absolute URL'],
    ['\\\\evil.example.com', 'backslash escape'],
    ['/redirect?to=https://evil.example.com\\x', 'embedded backslash'],
    ['expenses', 'relative path'],
    [null, 'missing value'],
    ['', 'empty value'],
  ];

  it.each(unsafe)(
    'rejects %p (%s) and falls back to the default landing route',
    (raw) => {
      expect(safeNextPath(raw)).toBe(DEFAULT_LANDING_PATH);
    },
  );

  it('honours an explicit fallback', () => {
    expect(safeNextPath(null, LOGIN_PATH)).toBe(LOGIN_PATH);
  });
});
