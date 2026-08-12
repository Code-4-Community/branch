# AGENTS.md — frontend

Next.js 15.5 app (App Router, Turbopack), React 19. Talks to the backend lambda microservices. UI: Chakra UI v3 (unstyled primitives) + Tailwind v4. Auth: JWT in localStorage via a React context.

**Deployed as a static SPA.** `next.config.ts` sets `output: 'export'` — `npm run build` emits `out/`, synced to S3 + served by CloudFront (see `infrastructure/aws/frontend_hosting.tf`, `.github/workflows/frontend-deploy.yml`). No server: everything is client-rendered. Dynamic routes (`projects/[id]`) need `generateStaticParams` in a **Server Component** — the page is a thin server wrapper delegating to a `'use client'` component; deep links resolve via the CloudFront SPA fallback. `NEXT_PUBLIC_API_BASE_URL` (set at build) points the client at API Gateway.

> `README.md` here is `create-next-app` boilerplate — ignore it.

## Commands

```bash
npm run dev        # next dev --turbopack  (port 3000)
npm run build      # next build --turbopack
npm run start      # serve production build
npm run lint       # eslint (flat config, next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit
npm run test       # jest --passWithNoTests
```

## Structure

```
src/
  app/                      # App Router — file = route
    layout.tsx              # root layout (Server Component)
    providers.tsx           # 'use client' — ChakraProvider + AuthProvider
    globals.css             # Tailwind v4 import + @theme custom tokens
    page.tsx                # routes by session; also absorbs the CloudFront SPA fallback
    dashboard/ login/ forgot-password/ reset-password/ donors/ donations/ expenses/
    projects/page.tsx       # projects index
    projects/[id]/page.tsx  # dynamic route
    components/             # shared UI (AuthGate, Navbar, Header, tables, modals, form fields)
  context/AuthContext.tsx   # useAuth() — session, login/challenge/logout/reset
  hooks/useApi.ts           # useApi() — authenticated HTTP, the one components should use
  hooks/useQueryParams.ts   # sync filter state <-> URL query string
  lib/api.ts                # apiFetch<T>() + ApiError — raw HTTP, no session awareness
  lib/authTokens.ts         # the ONLY module that touches token storage
  lib/authClient.ts         # authedFetch + single-flight refresh + session-expiry events
  lib/routes.ts             # route access policy (protected-by-default)
test/                       # jest + RTL mirror of src/ (custom render in test/utils.tsx)
```

`@/*` path alias → `src/*` (`tsconfig.json`).

## Data fetching

No React Query / SWR / Redux. Pattern: `useState` + `useEffect` + `apiFetch`, local component state.

**Components should call `useApi()`, not `apiFetch`.** `useApi()` returns a stable `{ get, post, patch, put, del }` over `authedFetch`, which attaches the current access token, refreshes it when it is expiring or a 401 comes back, and ends the session cleanly when it cannot. Never read a token out of storage and thread it through props — that pattern is what previously sent unauthenticated requests, because `localStorage.getItem(...) ?? ''` yields an empty token and `apiFetch` then silently omits the header.

`src/lib/api.ts` — `apiFetch<T>(path, { token?, ... })`, the raw client underneath. Routes by first path segment to a service port (auth→3006, projects→3002, donors→3003, expenditures→3004, reports→3005, users→3001), or to `NEXT_PUBLIC_API_BASE_URL` if set. Throws `ApiError` (carrying `status` and `body`) on non-2xx. In production `NEXT_PUBLIC_API_BASE_URL` (API Gateway) is set at build so every call goes there with its full prefixed path; the localhost port map is the dev fallback. (Static export has no server, so there are no `next.config` rewrites.) Use `apiFetch` directly only for genuinely unauthenticated endpoints (`/auth/login`, `/auth/refresh`, `/auth/forgot-password`).

Import direction is one-way and must stay that way: `api.ts` ← `authClient.ts` ← `AuthContext.tsx` / `hooks/useApi.ts`.

## Auth

**No Cognito SDK on the client.** The browser only ever talks to the backend's `/auth/*` routes; the auth lambda does the Cognito work.

**Session.** Tokens (`branch_access_token` / `branch_id_token` / `branch_refresh_token`) live in localStorage, owned exclusively by `src/lib/authTokens.ts`. `grep -rn "branch_access_token" src/` must only ever match that file.

**Identity comes from `GET /auth/me`, never from decoding a token.** `is_admin` lives only in Postgres and there is no pre-token-generation trigger, so it is not a JWT claim; a Cognito *access* token carries neither `email` nor `name` either. `AuthProvider` calls `/auth/me` on mount (skipping the call entirely when no tokens are stored) and exposes `user`, `isAuthenticated`, `isAdmin`, `isLoading`. Do not add a "fall back to decoding the ID token" path.

**Refresh.** Access tokens last one hour. `AuthProvider` schedules a refresh ~2 minutes before expiry, and `authedFetch` refreshes reactively on a 401. Refresh is single-flight, so a burst of concurrent 401s produces one `POST /auth/refresh`. Cognito does not re-issue a refresh token, so `saveTokens` leaves the stored one alone when the response omits it.

**Guarding.** `src/app/components/AuthGate.tsx`, mounted once in `providers.tsx`, is the app's only route guard — static export means `middleware.ts` would never run. `src/lib/routes.ts` classifies routes and is **protected-by-default**: a new page under `src/app/` is guarded without opting in. Public routes are `/login`, `/forgot-password`, `/reset-password` (authenticated users get bounced off them); `/expenses`, `/reports` and `/accounts` additionally require `isAdmin`. Always compare paths through `normalizePath` — `trailingSlash: true` means production sees `/login/` where dev and tests see `/login`.

**Challenges.** `login()` returns `{ status: 'authenticated' }` or `{ status: 'challenge', ... }`. `NEW_PASSWORD_REQUIRED` is handled by the login page; the other challenge names are plumbed through `respondToChallenge` and become reachable if MFA is switched on in `infrastructure/aws/cognito.tf`, needing only a UI step.

**No self-serve signup.** The backend still serves `/auth/register`, `/auth/verify-email` and `/auth/resend-code`, but the frontend deliberately does not expose them — see the comment in `AuthContext.tsx`. Onboarding is admin-invite.

## Styling

- Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`), `@import "tailwindcss"` in `globals.css`. Custom theme tokens in the `@theme` block (`--color-core-green`, `--color-primary-*`, fonts Roboto Slab / PT Sans, heading/body sizes).
- Chakra UI v3 unstyled components (`Table.Root`, `Dialog`, `Field`, `Button`, `Input`, ...) under `ChakraProvider defaultSystem`. Emotion is a Chakra dep. Inline styles appear alongside Tailwind classes in layout components.

## Shared UI

Three families of component are **the** way to do their job — don't hand-roll a second one.

**Tables — `components/DataTable.tsx`.** Every list view (expenses, reports, donors, donations) renders through it, so the green header row, column widths, empty state, row-click behaviour and loading skeleton stay identical. Columns are data: `{ key, header, width, align, cell, skeleton }`. Pass `selection` (see `reports/page.tsx`) for the leading checkbox column — the page keeps owning the selected ids, since that is what its bulk actions need. `ExpensesTable` is a thin wrapper that fixes the expense column set; add domain wrappers like that rather than re-deriving columns per page.

**Loading — `Spinner` / `LoadingState` / `Skeleton` / `TableSkeletonRows`.** No more `<p>Loading…</p>`.

- `LoadingState` for a region whose content has not arrived (`variant="section"` reserves height; `"inline"` for menus and dialog bodies). The label is the accessible name and is hidden unless `showLabel`.
- `DataTable isLoading` for tables — skeleton rows keep the header and column widths on screen. Set `skeletonRows` to the page size so nothing resizes when data lands.
- `Button isLoading` for in-flight actions (our `Button`; Chakra's own buttons use its `loading` prop).
- `Spinner` is the primitive; it takes its colour from `currentColor` and only gets a `label` when nothing around it is already `role="status"`.

The animations live in `globals.css` (`.branch-spinner`, `.branch-skeleton`, and their keyframes), not in the components — one timing curve for the whole app, and `FullPageSpinner` can render before any component library is mounted. Both honour `prefers-reduced-motion`.

**Popovers — `hooks/useAnchoredPopover.ts`.** Anything that floats next to a trigger (`DatePickerField`, `StaffPicker`) goes through this hook. The caller owns the open state and passes it in with `onDismiss` and an `estimatedHeight`; the hook returns `{ anchorRef, popoverRef, boundaryRef, position }`, where `position` is viewport coordinates to spread onto a `position: fixed` panel. It flips above the anchor when the viewport would clip it, repositions on scroll and resize, and dismisses on outside-click and `Escape`. Render the panel through `createPortal` into `document.body` — a popover left in normal flow is clipped by the modal body's scroll container, which is the bug this hook exists to prevent.

## Conventions

- Page/interactive components start with `'use client'`.
- Types are currently defined **inline** per file (`Expenditure`, `Project`, `User`). `@branch/types` is **not** consumed by the frontend yet — don't assume shared types here.
- Filters synced to the URL via `useQueryParams<T>(defaults)` (uses `router.replace`, supports comma-separated array values).

## Testing

Jest + React Testing Library, `jsdom`. `jest.config.ts` matches `test/**/*.test.{ts,tsx}`; `jest.setup.ts` mocks `next/navigation`, `next/link`, `next/font` and polyfills `structuredClone`/`ResizeObserver`/`scrollTo`. Use the custom `render` from `test/utils.tsx` (wraps Chakra + Auth providers), not RTL's bare render. CI: `.github/workflows/frontend-ci.yml` runs typecheck → lint → build → test. End-to-end (Cypress) lives in `apps/frontend-e2e/`.
