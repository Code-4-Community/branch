# AGENTS.md — frontend

Next.js 15.5 app (App Router, Turbopack), React 19. Talks to the backend lambda microservices. UI: Chakra UI v3 (unstyled primitives) + Tailwind v4. Auth: JWT in localStorage via a React context.

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
    page.tsx login/ forgot-password/ reset-password/ donors/ donations/ expenses/
    projects/[id]/page.tsx  # dynamic route
    components/             # shared UI (Navbar, Header, ExpensesTable, Pagination, modals, form fields)
  context/AuthContext.tsx   # useAuth() — login/register/verify/logout/reset; tokens in localStorage
  hooks/useQueryParams.ts   # sync filter state <-> URL query string
  lib/api.ts                # apiFetch<T>() — the single HTTP client
test/                       # jest + RTL mirror of src/ (custom render in test/utils.tsx)
```

`@/*` path alias → `src/*` (`tsconfig.json`).

## Data fetching

No React Query / SWR / Redux. Pattern: `useState` + `useEffect` + `apiFetch`, local component state.

`src/lib/api.ts` — `apiFetch<T>(path, { token?, ... })`. In production set `NEXT_PUBLIC_API_BASE_URL` (the API Gateway stage URL) — all calls go there with their **full prefixed path** (`/auth/login`, `/projects/:id/members`). With it unset (local dev), it routes by first path segment to a service port (auth→3006, projects→3002, donors→3003, expenditures→3004, reports→3005, users→3001). Injects `Authorization: Bearer <token>`. Throws on non-2xx. `next.config.ts` has dev-only pass-through rewrites per service (full prefixed paths, no stripping) as a fallback for same-origin requests. New backend calls go through `apiFetch` — don't hand-roll `fetch`.

## Auth

`src/context/AuthContext.tsx` — custom JWT, **no Cognito SDK on the client**. Login POSTs `/auth/login`, stores `branch_access_token` / `branch_id_token` / `branch_refresh_token` in localStorage, decodes the ID token payload (base64) for user claims. `useAuth()` exposes `login, register, verifyEmail, logout, getAccessToken, forgotPassword, resetPassword`. Pass `getAccessToken()` result as the `token` option to `apiFetch` for protected calls. Navbar filters items by user role.

## Styling

- Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`), `@import "tailwindcss"` in `globals.css`. Custom theme tokens in the `@theme` block (`--color-core-green`, `--color-primary-*`, fonts Roboto Slab / PT Sans, heading/body sizes).
- Chakra UI v3 unstyled components (`Table.Root`, `Dialog`, `Field`, `Button`, `Input`, ...) under `ChakraProvider defaultSystem`. Emotion is a Chakra dep. Inline styles appear alongside Tailwind classes in layout components.

## Conventions

- Page/interactive components start with `'use client'`.
- Types are currently defined **inline** per file (`Expenditure`, `Project`, `User`). `@branch/types` is **not** consumed by the frontend yet — don't assume shared types here.
- Filters synced to the URL via `useQueryParams<T>(defaults)` (uses `router.replace`, supports comma-separated array values).

## Testing

Jest + React Testing Library, `jsdom`. `jest.config.ts` matches `test/**/*.test.{ts,tsx}`; `jest.setup.ts` mocks `next/navigation`, `next/link`, `next/font` and polyfills `structuredClone`/`ResizeObserver`/`scrollTo`. Use the custom `render` from `test/utils.tsx` (wraps Chakra + Auth providers), not RTL's bare render. CI: `.github/workflows/frontend-ci.yml` runs typecheck → lint → build → test. End-to-end (Cypress) lives in `apps/frontend-e2e/`.
