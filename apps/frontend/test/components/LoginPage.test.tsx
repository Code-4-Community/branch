import { render, screen, waitFor } from '../utils';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';
import { ApiError } from '@/lib/api';

// The global next/navigation mock in jest.setup.ts hands back a fresh spy on
// every call, so redirects cannot be asserted against it. A local mock with
// stable spies is required — and it must provide useSearchParams, which the page
// now uses to read ?next=.
const mockPush = jest.fn();
const mockReplace = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    usePathname: () => '/login',
    useSearchParams: () => searchParams,
}));

const mockLogin = jest.fn();
const mockRespondToChallenge = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({
    ...jest.requireActual('../../src/context/AuthContext'),
    useAuth: () => ({
        login: mockLogin,
        respondToChallenge: mockRespondToChallenge,
    }),
}));

async function fillCredentials(email = 'jane@example.com', password = 'Password123!') {
    await userEvent.type(screen.getByPlaceholderText('Enter email address'), email);
    await userEvent.type(screen.getByPlaceholderText('Enter password'), password);
}

function submit() {
    return userEvent.click(screen.getByRole('button', { name: 'Login' }));
}

beforeEach(() => {
    jest.clearAllMocks();
    searchParams = new URLSearchParams();
});

describe('Login Page Component', () => {
    describe('rendering', () => {
        it('renders the login heading', () => {
            render(<LoginPage />);
            expect(screen.getByText('Login', { selector: 'h1' })).toBeInTheDocument();
        });

        it('renders the branch subheading', () => {
            render(<LoginPage />);
            expect(
                screen.getByText('BRANCH Accounting Platform', { selector: 'h5' }),
            ).toBeInTheDocument();
        });

        it('renders the email and password input fields', () => {
            render(<LoginPage />);
            expect(screen.getByPlaceholderText('Enter email address')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
        });

        it('masks the password and labels both fields for password managers', () => {
            // Without type=password plus these autocomplete hints the browser
            // neither hides the value nor offers to save the credentials.
            render(<LoginPage />);
            const email = screen.getByPlaceholderText('Enter email address');
            const password = screen.getByPlaceholderText('Enter password');

            expect(password).toHaveAttribute('type', 'password');
            expect(password).toHaveAttribute('autocomplete', 'current-password');
            expect(email).toHaveAttribute('autocomplete', 'username');
        });

        it('submits a real form, which is what triggers the save-password prompt', () => {
            render(<LoginPage />);
            expect(
                screen.getByPlaceholderText('Enter password').closest('form'),
            ).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Login' })).toHaveAttribute(
                'type',
                'submit',
            );
        });

        it('unmasks the password while "Show password" is checked', async () => {
            render(<LoginPage />);
            const password = screen.getByPlaceholderText('Enter password');
            const toggle = screen.getByRole('checkbox', { name: /show password/i });

            await userEvent.click(toggle);
            expect(password).toHaveAttribute('type', 'text');

            await userEvent.click(toggle);
            expect(password).toHaveAttribute('type', 'password');
        });

        it('renders the login button', () => {
            render(<LoginPage />);
            expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
        });

        it('renders the forgot password link pointing to /forgot-password', () => {
            render(<LoginPage />);
            const link = screen.getByRole('link', { name: 'Forgot password?' });
            expect(link).toBeInTheDocument();
            expect(link).toHaveAttribute('href', '/forgot-password');
        });
    });

    describe('submitting', () => {
        it('signs in and hands off to the root route, which routes by role', async () => {
            // The landing page depends on isAdmin, which only arrives with
            // GET /auth/me — so this page names "/" rather than guessing.
            mockLogin.mockResolvedValue({ status: 'authenticated' });
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() =>
                expect(mockLogin).toHaveBeenCalledWith('jane@example.com', 'Password123!'),
            );
            expect(mockReplace).toHaveBeenCalledWith('/');
        });

        it('honours a ?next= target', async () => {
            searchParams = new URLSearchParams('next=/expenses');
            mockLogin.mockResolvedValue({ status: 'authenticated' });
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/expenses'));
        });

        it('ignores an off-site ?next= target', async () => {
            searchParams = new URLSearchParams('next=//evil.example.com');
            mockLogin.mockResolvedValue({ status: 'authenticated' });
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
        });

        it('does not call login when validation fails', async () => {
            render(<LoginPage />);

            await userEvent.type(
                screen.getByPlaceholderText('Enter email address'),
                'not-an-email',
            );
            await submit();

            expect(mockLogin).not.toHaveBeenCalled();
            expect(mockReplace).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('reports bad credentials on a 401 and does not navigate', async () => {
            mockLogin.mockRejectedValue(new ApiError('Invalid email or password', 401));
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() =>
                expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument(),
            );
            expect(mockReplace).not.toHaveBeenCalled();
        });

        it('distinguishes a network failure from bad credentials', async () => {
            // fetch rejects with a TypeError when the request never reached a server.
            mockLogin.mockRejectedValue(new TypeError('Failed to fetch'));
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() =>
                expect(screen.getByText(/Cannot reach the server/i)).toBeInTheDocument(),
            );
            expect(screen.queryByText(/Incorrect email or password/i)).not.toBeInTheDocument();
        });

        it('surfaces the real message on a server error', async () => {
            mockLogin.mockRejectedValue(new ApiError('Database unavailable', 500));
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() =>
                expect(screen.getByText('Database unavailable')).toBeInTheDocument(),
            );
        });
    });

    describe('challenges', () => {
        const npr = {
            status: 'challenge',
            challengeName: 'NEW_PASSWORD_REQUIRED',
            session: 'sess-1',
            email: 'jane@example.com',
        };

        it('shows the set-password step for NEW_PASSWORD_REQUIRED without navigating', async () => {
            mockLogin.mockResolvedValue(npr);
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() =>
                expect(screen.getByText('Set a new password')).toBeInTheDocument(),
            );
            expect(mockReplace).not.toHaveBeenCalled();
        });

        it('completes the challenge and then redirects', async () => {
            mockLogin.mockResolvedValue(npr);
            mockRespondToChallenge.mockResolvedValue({ status: 'authenticated' });
            render(<LoginPage />);

            await fillCredentials();
            await submit();
            await waitFor(() =>
                expect(screen.getByText('Set a new password')).toBeInTheDocument(),
            );

            await userEvent.type(
                screen.getByPlaceholderText('Enter new password'),
                'NewPassword1!',
            );
            await userEvent.type(screen.getByPlaceholderText('Retype password'), 'NewPassword1!');
            await userEvent.click(
                screen.getByRole('button', { name: /Set password and sign in/i }),
            );

            await waitFor(() =>
                expect(mockRespondToChallenge).toHaveBeenCalledWith(
                    expect.objectContaining({
                        challengeName: 'NEW_PASSWORD_REQUIRED',
                        session: 'sess-1',
                        newPassword: 'NewPassword1!',
                    }),
                ),
            );
            expect(mockReplace).toHaveBeenCalledWith('/');
        });

        it('explains that an MFA challenge is not supported yet', async () => {
            mockLogin.mockResolvedValue({
                status: 'challenge',
                challengeName: 'SOFTWARE_TOKEN_MFA',
                session: 'sess-1',
                email: 'jane@example.com',
            });
            render(<LoginPage />);

            await fillCredentials();
            await submit();

            await waitFor(() => expect(screen.getByText(/SOFTWARE_TOKEN_MFA/)).toBeInTheDocument());
            expect(mockReplace).not.toHaveBeenCalled();
        });
    });
});
