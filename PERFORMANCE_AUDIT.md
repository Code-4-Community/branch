# Performance audit — load times

Audited at `worktree-rbac-framework` (PR #354), against `main` @ `53ec5fb`. All four
migrations in `apps/backend/db/migrations/` are already live on `main`.

**Constraint honoured throughout: no significant additional cloud cost.** Every
recommendation below is $0/month except the one marked `+$1.15/mo`. Explicitly
*rejected* on cost grounds: ElastiCache, RDS Proxy (~$15/mo/vCPU), Lambda
provisioned concurrency, API Gateway stage caching (~$14/mo minimum), a NAT
gateway for VPC lambdas (~$33/mo).

## Conclusion first

Load time here is **not** query-plan bound. It is bound by round trips, cold
starts and payload size, in that order. The index work already done in
`20260812022651_add_access_pattern_indexes.sql` covered the hot access paths;
there are three indexes left worth adding and one worth dropping, but they are
item 9 on this list, not item 1.

The four changes that matter most are all configuration, not code:

| # | Change | Cost | Expected win |
|---|---|---|---|
| 1 | `OPTIONS` → MOCK integration + `Access-Control-Max-Age` | $0 (cheaper) | ~50% of all Lambda invocations |
| 2 | `--minify` + `--external:@aws-sdk/*` in lambda packaging | $0 | 8x smaller bundles, less cold-start parse |
| 3 | Enable API Gateway response compression | $0 | 70-80% off JSON list transfer |
| 4 | `pg.Pool` `max: 1` | $0 | removes a production outage risk |

---

## 1. Every API call costs two Lambda invocations

`infrastructure/aws/api_gateway.tf:44` appends `OPTIONS` to every service
resource and `:109` puts `ANY` on each `{proxy+}` — both wired to
`type = "AWS_PROXY"` (`:75-93`, `:118-129`). So a CORS preflight **invokes the
Lambda**.

Nothing sets `Access-Control-Max-Age`. Not in the gateway responses
(`api_gateway.tf:21-23`) and not in the handler's own headers
(`shared/lambda-http/src/response.ts:9-11`). The frontend sends `Authorization`
and `Content-Type: application/json` on every call, which always triggers a
preflight, and Chrome's default preflight cache without `Max-Age` is ~5s. In
practice: **every API request is preceded by its own Lambda-backed preflight.**

`shared/lambda-http/src/dispatch.ts:40` does short-circuit `OPTIONS` before auth,
so the preflight does no DB work — but a *cold* container still parses the entire
bundle first (see §2), so a preflight can cost hundreds of ms on its own.

Fix, in order of value:
1. Replace the `OPTIONS` method's integration with `type = "MOCK"` returning the
   CORS headers plus `Access-Control-Max-Age: 7200`. The Lambda is never invoked.
2. Add `Access-Control-Max-Age` to `response.ts` too, so the `{proxy+}` `ANY`
   route benefits until it is split.
3. `{proxy+}` uses `ANY`, which cannot be given a per-method MOCK integration.
   Add an explicit `OPTIONS` method on the proxy resource ahead of `ANY`.

This *reduces* spend — it halves invocation count.

## 2. Lambda bundles are up to 8x larger than needed

`package` scripts (e.g. `apps/backend/lambdas/projects/package.json`) run esbuild
with `--bundle` but no `--minify`, and they bundle the AWS SDK, which the
`nodejs20.x` runtime already provides. Measured in this worktree:

| lambda | current | `--minify --external:@aws-sdk/*` |
|---|---|---|
| reports | 5.4 MB | 1.75 MB |
| users | 2.1 MB | 252 KB |
| auth | 1.7 MB | 264 KB |
| projects | ~2 MB | 264 KB |
| expenditures | ~2 MB | 260 KB |
| donors | 651 KB | 252 KB |

`users` and `auth` sit on the critical path of every page load, and both drop by
~8x. `reports` also statically pulls `pdfmake` and `docx`
(`apps/backend/lambdas/reports/report-service.ts:3-23`); it is admin-only and
infrequent, so it matters least, but it is also the one that benefits from
`--external` the most in absolute terms.

Caveat on `--external:@aws-sdk/*`: it takes the SDK version from the runtime
rather than the lockfile. That is a real (if widely accepted) trade. If you would
rather not, `--minify` alone is unambiguously free.

Also note `apps/backend/lambdas/reports/package.json` depends on `aws-lambda`
(the npm package, an unrelated deployment tool) — the types come from
`@types/aws-lambda`. Worth confirming it is unused and removing it.

## 3. No response compression

`aws_api_gateway_rest_api.branch_api` (`api_gateway.tf:2-9`) does not set
`minimum_compression_size`. REST API will gzip responses when it is set. JSON
lists compress 70-80%. One line, $0.

## 4. `pg.Pool` has no `max` — connection exhaustion risk

All six `db.ts` files are identical (`apps/backend/lambdas/*/db.ts`). None sets
`max`, so each pool defaults to **10**. A Lambda container serves one request at
a time, so nine of those ten are dead weight, and the ceiling is
`concurrent containers × 6 services × 10`.

The instance is `db.t3.micro` (`infrastructure/aws/main.tf:11`), 1 GiB RAM, so
`max_connections` ≈ 112. A modest traffic spike exhausts it and requests start
failing rather than slowing. Set `max: 1`.

While in that file:
- `idleTimeoutMillis` is unset (default 10s). Lambda freezes containers between
  invocations, so the reaper does not fire on schedule and a thawed container can
  hand out a socket the server already closed. Set `idleTimeoutMillis: 0` and
  `keepAlive: true`.
- No `statement_timeout`. Nothing bounds a slow query below the 30s function
  timeout. Set it well under 30s so a runaway query fails fast.
- `ssl: { rejectUnauthorized: false }` — encrypted but unauthenticated. Already
  flagged by the `TODO` at `db.ts:16`. Not a performance item, but the CI
  workflow already downloads the RDS CA bundle
  (`.github/workflows/lambda-deploy.yml:210-213`), so the fix is close at hand.

## 5. RDS storage is IOPS-starved — the one item with a cost

`infrastructure/aws/main.tf:2` sets `allocated_storage = 10` with no
`storage_type`, which means **gp2 at 100 baseline IOPS** (gp2 gives 3 IOPS/GB
with a floor of 100). Once burst credits are spent, that is the ceiling for the
whole database.

gp3 requires a 20 GB minimum on RDS Postgres and includes **3000 baseline IOPS**
at no IOPS charge. Delta is roughly **+$1.15/month** for 30x the throughput. This
is the best price/performance change available and does not force instance
replacement.

Also enable Performance Insights — the 7-day retention tier is **free** on every
instance class, and it is the only way to see which statements actually hurt in
production rather than reasoning about it from source, as this audit had to.

Do not raise `backup_window` while editing this resource: AWS rejects a backup
window overlapping the (unmanaged) maintenance window. Pin both or neither.

## 6. Auth costs two sequential round trips on every request

`shared/lambda-http/src/authz.ts:39-43` runs, per guarded request:

1. `shared/lambda-auth/src/authenticate.ts:66-70` — users by `cognito_sub`
2. `shared/lambda-auth/src/rbac.ts:29-33` — memberships by `user_id`

These are strictly serial because (2) needs `userId` from (1). One `LEFT JOIN`
from `users` to `project_memberships` keyed on `cognito_sub` returns both in one
trip, and `buildSubject` (`shared/rbac/src/subject.ts:51-56`) already accepts the
row-per-membership shape. Lowest-risk latency cut in the backend: no staleness,
halves the auth floor on every call.

`authenticate.ts:66` also uses `selectAll()` while only `user_id` and `is_admin`
are read. Worth narrowing, but the impact is small — `profile_image` holds an S3
URL, not a base64 data URI (confirmed via
`apps/backend/lambdas/users/test/users.test.ts:227`), so this is a few hundred
bytes, not a blob.

`GET /auth/me` costs **three** queries: `authenticate.ts` reads the user row,
then `apps/backend/lambdas/auth/controllers/auth.ts:202-205` re-reads *the same
row by the same key* for different columns, then `:220` loads the subject. The
middle read is redundant — the row is already in hand.

Caching the subject in a module-scope `Map` with a 30-60s TTL would remove most
of this on warm containers, but `is_admin` and memberships are authoritative-on-
read in this codebase, so a revocation would lag by up to the TTL. That is a
policy decision, not a free win — the JOIN above is the safe version.

## 7. Serial count-then-page on every paginated list

Every paginated endpoint awaits its `COUNT`, then awaits the page. They are
independent; each pair wastes one round trip:

- `apps/backend/lambdas/donors/controllers/donors.ts:33` → `:41`
- `apps/backend/lambdas/donors/controllers/donations.ts:42` → `:52`
- `apps/backend/lambdas/users/controllers/users.ts:29` → `:37`
- `apps/backend/lambdas/reports/controllers/reports.ts:156` → `:163`
- `apps/backend/lambdas/expenditures/controllers/expenditures.ts:60` → `:62`

`Promise.all` on each. The counts themselves are correct and deliberately
filtered by the same predicate as the page — keep that
(`apps/backend/lambdas/AGENTS.md:112-114`).

Same shape elsewhere:
- `donors/controllers/donations.ts:105-123` — independent donor-exists and
  project-exists checks. Or drop both: the `23503` FK handler at `:142` already
  produces the 404.
- `expenditures/controllers/expenditures.ts:216`, `:219` — `findUserName` then
  `findProjectName`. Folding both into the read at `:208` as joins takes 3 trips
  to 1.
- `reports/report-service.ts:132,140,152,164` — four serial reads; the last three
  depend only on `projectId`. 4 trips → 2.
- `projects/controllers/dashboard.ts:190` → `:197` — the three scoped queries do
  not depend on the project row.
- `users/controllers/users.ts:96,132,138` — SELECT, UPDATE, re-SELECT. One
  `UPDATE ... RETURNING` does it.
- `expenditures/controllers/expenditures.ts:279` and `:354` — the post-write
  re-read is pure waste; `.returningAll()` gives the same row. (The *pre*-write
  read at `:254` is needed for the RBAC `resourceOf` check — keep it.)

## 8. Unbounded responses

These grow without limit as data accumulates, which is the failure mode where
"it got slower over time" comes from:

- `apps/backend/lambdas/projects/controllers/dashboard.ts:205-210` — the project
  overview selects **every** expenditure row for the project, no `LIMIT`, then
  reduces in Node at `:225-226` for `totalSpent`. The rows are genuinely rendered
  by the detail page, so the fetch is not wasted — but the totals should come
  from a `SUM`/`COUNT ... WHERE status='approved'` added to the existing
  `Promise.all`, and the row list needs a cap. `apps/backend/lambdas/AGENTS.md`
  already mandates aggregating in SQL.
- Every list endpoint has a no-pagination branch: omit `page`/`limit` and you get
  the whole filtered table. `users/controllers/users.ts:55-58` is a bare
  `SELECT * FROM branch.users`. Add a default `limit` cap.
- `apps/backend/lambdas/donors/controllers/donations.ts:60-62` — the unpaginated
  branch has no `ORDER BY` at all, so results are non-deterministic.

Related over-fetch: `expenditures/services/expenditures.ts:64` selects
`admin_notes`, which is then stripped in Node for non-admins by
`redactAdminNotes` (`controllers/expenditures.ts:79-88`). The permission is known
before the query is built — pick the column list from it.

`selectAll()` used only for an existence check, where a single column would do:
`projects/controllers/donors.ts:17`, `projects/controllers/expenditures.ts:12`,
`users/controllers/users.ts:204`, `expenditures/services/expenditures.ts:81`.

## 9. Indexes — three to add, one to drop

Current state is good. `20260812022651_add_access_pattern_indexes.sql` added the
seven FK/sort indexes that mattered, and before it the schema had **zero**
non-constraint indexes. The remaining gaps, in priority order:

```sql
-- GET /projects/assignable-staff sorts the whole user table by name on every
-- open of the project-edit form; dashboard.ts:203 sorts the same column.
CREATE INDEX users_name_idx ON users (name);

-- status is filtered by the four dashboard aggregates and the report generator
-- (projects/services/projects.ts:118, dashboard.ts:47/57/71/111,
-- report-service.ts:168) and is currently a heap predicate after a spent_on
-- range scan.
CREATE INDEX expenditures_status_spent_on_idx ON expenditures (status, spent_on);

-- GET /donors/donations filters project_id then sorts donation_id; the existing
-- single-column index serves the filter but not the sort.
CREATE INDEX project_donations_project_id_donation_id_idx
    ON project_donations (project_id, donation_id);

-- Redundant once the composite above exists: same leading column, strict prefix.
DROP INDEX project_donations_project_id_idx;
```

Considered and **not** recommended: an index on `projects.end_date` for
`dashboard.ts:53-54`. The predicate is `end_date IS NULL OR end_date >= today`,
whose `OR` forces a BitmapOr, and `projects` is small enough that a sequential
scan wins. Not worth the write cost.

Nothing else is a removal candidate — `expenditures_spent_on_idx` and
`reports_date_created_idx` look redundant against their composite siblings but
have different leading columns and serve the unfiltered lists.

Note `apps/backend/BACKEND_ANALYSIS.md:341-352` ("Missing Database Indexes") is
stale: it recommends three indexes the August migration already created.

## 10. Query patterns to change

**No N+1 anywhere.** The two places that would naturally be N+1 are already
batched into `GROUP BY` queries (`projects/services/projects.ts:114`,
`dashboard.ts:80-98`). Credit where due.

**Pagination is `OFFSET`-based everywhere.** `OFFSET 10000` reads and discards
10 000 rows. Three of the five lists already sort on a monotonic unique key
(`donor_id`, `donation_id`, `user_id`), so keyset is a drop-in:
`WHERE id > :lastId ORDER BY id LIMIT n`. The two that sort on
`date_created`/`spent_on` need a `(date, id)` tiebreak — and note those two can
currently **skip or duplicate rows across pages** when dates tie, which is a
correctness bug, not just a performance one.

**`projectScopeIds()` itself is not a cost.** `shared/rbac/src/subject.ts:106-110`
is a pure function over `subject.memberProjectIds`, reusing the membership read
that `loadRbacSubject` performs regardless. Two real secondary effects:

- It splices ids in as `IN ($1, …, $n)`. Postgres re-plans per distinct parameter
  count, so a user on many projects thrashes the plan cache. Pass one array
  parameter instead: `sql\`project_id = ANY(${ids})\`` — one plan for all
  cardinalities.
- `apps/backend/lambdas/expenditures/services/scope.ts:37-42` builds
  `project_id IN (...) OR entered_by = ?`. That disjunction forces a BitmapOr
  across two indexes and then leaves neither able to serve
  `ORDER BY spent_on DESC`, so the scoped set is sorted every request. A `UNION`
  of the two arms, each with its own `ORDER BY ... LIMIT`, merged and re-limited,
  keeps the ordered index walk.

Not recommended: converting the scope filter to an inlined `EXISTS` subquery.
It would close the TOCTOU window the code documents at `subject.ts:85-87` *and*
fix the parameter-list problem, but the materialised subject is what
`GET /auth/me` ships to the browser so the frontend can evaluate the identical
policy. That is the design, and it should not be traded away for a plan-cache win.

---

# Frontend

## 11. The auth gate serializes every cold load

`apps/frontend/src/app/components/AuthGate.tsx:58` returns a full-page spinner
while `/auth/me` is in flight, and `AuthGate` wraps every route
(`apps/frontend/src/app/providers.tsx:15`). No page component mounts, so no page
fetch can start, until auth resolves. Chain:
`AuthContext.tsx:169-190` fires `/auth/me` → `isLoading` false → page mounts →
page `useEffect` fires its data call. **A hard two-round-trip floor on every cold
load** — and with §1 and §2 unfixed, each of those trips can include a cold start.

Be careful which gate you relax. The two checks at `AuthGate.tsx:60-63` are
*deliberate* render suppression — the comment there notes the redirect is async
and without them a protected page would mount and fetch during the redirect.
Leave those. It is the `isLoading` branch at `:58` that is worth changing:
hydrate `user` optimistically from a cached `/auth/me` payload and revalidate in
the background, so a returning signed-in user starts their page fetch
immediately.

Worst case today is three serial trips: `authClient.ts:115` proactively refreshes
a token within 30s of expiry, lazily on the first request, giving
`/auth/refresh` → `/auth/me` → `/projects`. Move that refresh into the bootstrap
effect so it overlaps.

Anonymous visitors are already correct — zero calls, `isLoading` settles on the
first flush.

## 12. No caching layer at all, and client-side pagination

There is no react-query, no SWR, no cache of any kind.
`apps/frontend/src/hooks/useApi.ts:49` is a `useMemo` for stable object identity,
nothing more. Consequences:

- **`/projects` is fetched by five independent call sites** —
  `ProjectListView.tsx:35`, `Navbar.tsx:227`, `donations/page.tsx:68`,
  `expenses/page.tsx:113`, `reports/page.tsx:126`. Navigating projects →
  donations → expenses issues three identical requests.
- **`apps/frontend/src/app/expenses/page.tsx:101`** fetches *every* expenditure
  the user can see, then slices 10 rows client-side at `:212`. The backend has
  accepted `?page=&limit=` since `expenditures.ts:58-66`, and
  `reports/page.tsx:111` already uses it — this page just was not updated.
- **`donors/page.tsx:68-71`** fetches all donors *and* all donations to derive
  `num_projects`/`last_donation` client-side at `:85-109`, then slices 10. The
  two aggregates need a server-side join before this page can paginate.
- **`donations/page.tsx:65-69`** fetches all donations + all donors + all
  projects purely to resolve `donor_name`/`project_name` at `:84-92`. Joining the
  names server-side drops two of the three requests.

A minimal promise-cache module keyed by path would fix the duplicate `/projects`
fetches without adding a dependency. Using the pagination that already exists is
independent of that and worth more as the tables grow.

Two click-time waterfalls, both one round trip of *perceived* latency:
`ReviewExpenseModal.tsx:89` refetches `/expenditures/:id` although the table row
already holds every field but `submittedByName`/`receiptUrl`; and
`ProjectFormModal.tsx:145-165` fetches `/projects/assignable-staff` only on the
rising edge of `open`, so the picker is empty until it lands.

No polling anywhere — `setInterval` does not appear in `src/`. The only timer is
the token refresh at `AuthContext.tsx:212`, correctly scheduled off `exp`.

## 13. Bundle — Chakra's full theme on every route

This is a Next.js 15 App Router app with `output: 'export'` (static SPA on
S3+CloudFront). `/dashboard` pulls 16 chunks totalling ~1.09 MB uncompressed.

`apps/frontend/src/app/providers.tsx:12` mounts
`<ChakraProvider value={defaultSystem}>` at the root, so Chakra's entire default
recipe table ships to every route — including `/dashboard` and `/projects`, which
render zero Chakra components and are pure Tailwind. The chunk carrying it is
**436 KB uncompressed** (~80-100 KB gzipped).

Both Chakra and Tailwind v4 are in use, and the codebase already pays for the
overlap — the `!`-prefixed utilities exist specifically to outrank Chakra's
reset. Either build a trimmed `createSystem` with only the recipes actually used
(Table, Dialog, Input, Checkbox, NativeSelect, Portal, Stack, CloseButton,
Button), or finish the migration to Tailwind. The former is the cheap version.

Also:
- **No route-level code splitting.** Not one `next/dynamic` or `React.lazy` in
  `src/`. Every modal is statically imported *and* unconditionally mounted while
  closed (`ProjectDetailView.tsx:201,209`, `expenses/page.tsx:339,348,358`,
  `reports/page.tsx:398`). Their fetch effects correctly early-return on `!open`,
  so this is bundle cost only. `next/dynamic(..., { ssr: false })` per modal, plus
  `qrcode` at `profile/page.tsx:5` which is only needed after clicking "Set up
  2FA".
- **Ten `react-icons` families** imported across `src/` (`lu`, `fa`, `ci`, `io5`,
  `md`, `fa6`, `fi`, `pi`, `ri`, `rx`), each a barrel re-exporting hundreds of
  components, with no `experimental.optimizePackageImports` in `next.config.ts`.
  Add that, and ideally consolidate onto `lu`, which already covers most usage.
- `polyfills-*.js` is 112 KB. Confirm Next emits it as `nomodule` under this
  export config; if not it is dead weight for modern browsers.

No `moment`, no `lodash`, no `date-fns` — dates are hand-rolled in
`src/lib/format.ts`. Charts are hand-rolled SVG with no chart library. No
component barrel. All good.

## 14. Fonts and one very large image

**`apps/frontend/src/app/globals.css:1`** — a render-blocking cross-origin
`@import` of Google Fonts sits on line 1, *above* the Tailwind import. Because it
is a CSS `@import` inside the bundled stylesheet, the browser cannot discover it
until it has downloaded and parsed the app CSS: a three-deep critical chain
(`app.css` → `fonts.googleapis.com` → `fonts.gstatic.com`) with no `preconnect`.
And **PT Sans is loaded twice** — here over the CDN and again self-hosted via
`next/font/google` at `Navbar.tsx:17`.

Move Roboto Slab and PT Sans to `next/font/google` in `layout.tsx` and delete the
`@import`. Typically 200-400 ms off blocked first paint. While there: `layout.tsx`
loads Geist and Geist_Mono, but `globals.css:42-43` only references Roboto Slab
and PT Sans — those look like leftover `create-next-app` defaults still being
downloaded. Confirm and delete.

**`apps/frontend/public/leaves-bg.png` is 292,869 bytes** and is rendered `fill`
into a 181 px sidebar rail on every authenticated page
(`Navbar.tsx:291`). `next.config.ts` sets `images: { unoptimized: true }`, which
is unavoidable under `output: 'export'`, so `next/image` does no resizing here.
Pre-resize to ~400 px wide and convert to WebP at build time: ~280 KB → ~15 KB.
**The best effort-to-win ratio in this entire audit.**

## 15. Render cost

Row counts are 10 per page everywhere, so virtualization is not needed and there
is no key-thrash. The costs are unmemoized per-render work:

- **`expenses/page.tsx:174-208`** — the full filter+sort of every expenditure
  runs on every render, including every keystroke in the search box. This is the
  only list page that skipped `useMemo` (donors and donations both use it).
  Inside it, `:191` does an O(n·m) `projects.find` per row, and the comparator at
  `:204-207` allocates two `Date` objects per comparison. Wrap in `useMemo`, hoist
  the project lookup to a `Map`, pre-parse `spent_on` once.
- **`expenses/page.tsx:128`** — `projectNames` is a fresh object every render,
  guaranteeing an `ExpensesTable` re-render. `useMemo` on `[projects]`.
- **`ExpensesTable.tsx:153`** — `why('expense:delete', ...)` evaluates the RBAC
  policy once per row on every render, and the `columns` array is rebuilt each
  render. `usePermissions.ts:37` memoizes the closures but not their results.
- **`Navbar.tsx:185,205-209`** — `hoveredIndex` is component state set on
  `onMouseEnter`/`onMouseLeave`, so moving the mouse down the sidebar re-renders
  the whole nav, and each render re-runs `visibleItems` — an `authorizeAny`
  policy evaluation for each of 9 nav items. Use CSS `:hover`, and `useMemo`
  `visibleItems` on `[effectiveSubject]`.
- **`DropdownSelector.tsx:30-38`** — the `useMemo` never hits because every call
  site passes a fresh array literal (`donors/page.tsx:137`,
  `donations/page.tsx:230,234`, `expenses/page.tsx:141`), so
  `createListCollection` re-runs on every parent render. `useMemo` the options at
  the call sites.

---

## Suggested order of work

1. `OPTIONS` → MOCK + `Access-Control-Max-Age` (§1) — biggest win, one file, $0.
2. `--minify` + `--external:@aws-sdk/*` (§2) — six one-line script edits.
3. `minimum_compression_size` (§3) and `pg.Pool max: 1` (§4) — two lines each.
4. `leaves-bg.png` resize and the font `@import` (§14) — trivial, very visible.
5. gp3 storage + free Performance Insights (§5) — the only spend, ~$1.15/mo, and
   PI is what lets you verify everything after this point with data instead of
   inference.
6. Auth JOIN (§6) and `Promise.all` on the count/page pairs (§7).
7. Server-side pagination on `/expenses`, then `/donors` and `/donations` (§12).
8. Chakra trim (§13) and the `useMemo` pass (§15).
9. The three indexes and one drop (§9).

## A note on the migration

I have **not** created a migration file for §9. Migrations in this repo are
applied to production automatically when the PR merges
(`apps/backend/db/migrations/*.sql` headers), and adding an index is forward-only
with no rollback. The SQL above is ready to paste, but landing it should be a
deliberate, separate PR — and one worth running against a restored snapshot with
`EXPLAIN (ANALYZE, BUFFERS)` first, since row counts here are small enough that
the planner may reasonably prefer a sequential scan on `users (name)`.

Note also that `CREATE INDEX CONCURRENTLY` will not work in these migrations —
they run inside a single transaction. At this table size a plain `CREATE INDEX`
and its brief write lock is fine, but that is worth re-checking before it stops
being true.
