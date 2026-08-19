import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthGate from '@/app/components/AuthGate';

// jest.setup.ts returns a fresh router spy on every call, so redirects need a
// local mock with stable spies and a mutable pathname.
const mockReplace = jest.fn();
let currentPath = '/projects';

// Stable object: the real useRouter returns a stable reference, and returning a
// fresh one here would re-run effects that list `router` as a dependency.
const mockRouter = { replace: mockReplace, push: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

let authState = { isAuthenticated: false, isAdmin: false, isLoading: false };

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => authState,
}));

function renderGate() {
  return render(
    <AuthGate>
      <div data-testid="protected-content">secret</div>
    </AuthGate>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  currentPath = '/projects';
  authState = { isAuthenticated: false, isAdmin: false, isLoading: false };
});

describe('AuthGate', () => {
  describe('while the session is still resolving', () => {
    it('does not redirect', () => {
      // Regression guard: redirecting before rehydration would bounce a
      // returning user to /login during their own bootstrap.
      authState = { isAuthenticated: false, isAdmin: false, isLoading: true };
      renderGate();

      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('protected routes', () => {
    it('redirects an anonymous visitor to /login with a next param', () => {
      currentPath = '/expenses';
      renderGate();

      expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Fexpenses');
    });

    it('keeps the dashboard behind the admin flag', () => {
      currentPath = '/dashboard';
      authState = { isAuthenticated: true, isAdmin: false, isLoading: false };
      renderGate();

      expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('does not render protected children to an anonymous visitor', () => {
      // The redirect is asynchronous; without render suppression the page would
      // mount and start fetching in the meantime.
      renderGate();

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('renders children for an authenticated user', () => {
      authState = { isAuthenticated: true, isAdmin: false, isLoading: false };
      renderGate();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('public routes', () => {
    it('bounces an authenticated non-admin off /login to a page they can load', () => {
      currentPath = '/login';
      authState = { isAuthenticated: true, isAdmin: false, isLoading: false };
      renderGate();

      expect(mockReplace).toHaveBeenCalledWith('/projects');
    });

    it('bounces an authenticated admin off /login to the dashboard', () => {
      currentPath = '/login';
      authState = { isAuthenticated: true, isAdmin: true, isLoading: false };
      renderGate();

      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });

    it('lets an anonymous visitor see /login', () => {
      currentPath = '/login';
      renderGate();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('lets an anonymous visitor see /forgot-password', () => {
      currentPath = '/forgot-password';
      renderGate();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('admin routes', () => {
    it('shows a no-access panel to a non-admin instead of redirecting', () => {
      currentPath = '/reports';
      authState = { isAuthenticated: true, isAdmin: false, isLoading: false };
      renderGate();

      expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      // A redirect could loop if the admin flag changes mid-session.
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('renders children for an admin', () => {
      currentPath = '/reports';
      authState = { isAuthenticated: true, isAdmin: true, isLoading: false };
      renderGate();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('sends an anonymous visitor to login rather than the no-access panel', () => {
      currentPath = '/accounts';
      renderGate();

      expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Faccounts');
      expect(screen.queryByText(/don't have access/i)).not.toBeInTheDocument();
    });
  });

  describe('trailing slashes', () => {
    it('classifies production-style paths the same as dev ones', () => {
      // next.config.ts sets trailingSlash: true, so production emits "/login/".
      currentPath = '/login/';
      authState = { isAuthenticated: true, isAdmin: true, isLoading: false };
      renderGate();

      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });
});
