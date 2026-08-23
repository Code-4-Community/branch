import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RootPage from '@/app/page';
import { adminSubject, memberSubject, session } from '../rbac';

const mockReplace = jest.fn();

// Stable object: the real useRouter returns a stable reference, and returning a
// fresh one here would re-run effects that list `router` as a dependency.
const mockRouter = { replace: mockReplace, push: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// A mocked session must carry an RBAC subject: AuthGate asks the shared policy
// now, and a subject-less session denies everything.
let authState: ReturnType<typeof session> = session();

jest.mock('../../src/context/AuthContext', () => ({
  ...jest.requireActual('../../src/context/AuthContext'),
  useAuth: () => authState,
}));

/** jsdom's window.location is non-configurable; drive it through history. */
function setLocation(pathname: string, search = '') {
  window.history.replaceState({}, '', `${pathname}${search}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  setLocation('/');
  authState = session();
});

describe('RootPage', () => {
  it('never renders the app shell', () => {
    // The reported bug: this page used to render <NavBar role="admin" />
    // unconditionally, so opening the site looked like being signed in.
    authState = session({ isLoading: true });
    const { container } = render(<RootPage />);

    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('sends an anonymous visitor to /login', async () => {
    render(<RootPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('sends an authenticated admin to /dashboard', async () => {
    authState = session({ subject: adminSubject() });
    render(<RootPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'));
  });

  it('sends an authenticated non-admin somewhere they can load', async () => {
    // /dashboard is admin-only, so routing every session there would land a
    // non-admin on the no-access panel straight off the root route.
    authState = session({ subject: memberSubject() });
    render(<RootPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/projects'));
  });

  it('waits for the session before routing', () => {
    authState = session({ isLoading: true });
    render(<RootPage />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe('CloudFront SPA fallback', () => {
    it('re-routes to the deep link it was served in place of', async () => {
      // CloudFront rewrites 403/404 to /index.html, so this document can be
      // served for a URL that has no exported page of its own.
      setLocation('/projects/7/', '?tab=expenses');
      render(<RootPage />);

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith('/projects/7/?tab=expenses'),
      );
    });

    it('shows a not-found panel instead of looping when the deep link cannot resolve', async () => {
      setLocation('/projects/7/');
      const { unmount } = render(<RootPage />);
      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      unmount();

      // Second pass: the router hard-navigated and CloudFront served us again.
      mockReplace.mockClear();
      render(<RootPage />);

      await waitFor(() => expect(screen.getByText('Page not found')).toBeInTheDocument());
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('clears the fallback marker on a genuine visit to the root', async () => {
      setLocation('/projects/7/');
      const first = render(<RootPage />);
      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      first.unmount();

      setLocation('/');
      mockReplace.mockClear();
      render(<RootPage />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
      // A later deep link must get a fresh retry rather than an instant 404.
      expect(sessionStorage.getItem('branch_spa_fallback_path')).toBeNull();
    });
  });
});
