import {
  LOGIN_PATH,
  POST_LOGIN_PATH,
  classifyRoute,
  normalizePath,
  requiresAdmin,
  safeNextPath,
} from '@/lib/routes';

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

describe('requiresAdmin', () => {
  it.each(['/reports/', '/accounts'])(
    'requires admin for %s',
    (path) => {
      expect(requiresAdmin(path)).toBe(true);
    },
  );

  // Non-admins submit expenses, so the page itself is not admin-gated; only the
  // approve/deny controls inside the review modal are.
  it.each(['/dashboard', '/donors', '/projects/7', '/reports-archive', '/expenses', '/expenses/123'])(
    'does not require admin for %s',
    (path) => {
      expect(requiresAdmin(path)).toBe(false);
    },
  );
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

  it.each(unsafe)('rejects %p (%s) and falls back to the dashboard', (raw) => {
    expect(safeNextPath(raw)).toBe(POST_LOGIN_PATH);
  });

  it('honours an explicit fallback', () => {
    expect(safeNextPath(null, LOGIN_PATH)).toBe(LOGIN_PATH);
  });
});
