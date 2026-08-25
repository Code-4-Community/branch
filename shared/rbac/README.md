# @branch/rbac

The authorization policy for BRANCH, as one table of data.

Both sides of the product evaluate this exact module:

- the lambdas, via `@branch/lambda-auth` (subject loading) and
  `@branch/lambda-http` (route enforcement), and
- the browser, via `usePermissions()` in `apps/frontend`.

That is the whole point. A greyed-out button and the 403 behind it cannot
disagree, because there is only one rule and one denial message.

## Roles

There is no global role column. `branch.users.is_admin` is the only global flag;
everything else is derived from `branch.project_memberships.role`.

| Role | How someone becomes one |
|---|---|
| **Admin** | `branch.users.is_admin = true` |
| **Director** | holds a `Director` membership on **at least one** project |
| **Member** | holds any membership, on the projects they hold it for |

"Director" is therefore a derived property, not a stored one — see
`buildSubject` in `src/subject.ts`, which also owns `PROJECT_ROLES`. The role
vocabulary lives beside the derivation that reads it so a new role cannot be
added in one place and silently produce a non-director in the other.

**Admin is not a membership role.** `PROJECT_ROLES` is `Director | Student`;
being an admin is `users.is_admin` and nothing else. A project-scoped `Admin`
role did exist, but since `is_admin` was never read from a membership it only
ever meant Director — so it was dropped and those rows rewritten
(`20260825023851_drop_project_admin_role.sql`).

## The matrix

✅ allowed · ❌ denied · **scoped** = allowed, but only for projects the user is
a member of (enforced in SQL, so out-of-scope rows never leave the database).

| Area | Action | Admin | Director | Member | Signed out |
|---|---|:--:|:--:|:--:|:--:|
| **Dashboard** | View | ✅ | ❌ | ❌ | ❌ |
| **Donors** | View roster | ✅ | ✅ | ❌ | ❌ |
| | Create / delete donor | ✅ | ❌ | ❌ | ❌ |
| **Donations** | View list | ✅ | **scoped** | **scoped** | ❌ |
| | Create / delete | ✅ | ❌ | ❌ | ❌ |
| **Expenses** | View list | ✅ | **scoped** | **scoped** | ❌ |
| | View one | ✅ | own projects, or authored | own projects, or authored | ❌ |
| | Create | ✅ | own projects | own projects | ❌ |
| | Edit / delete own, pending or needs-info | ✅ | ✅ | ✅ | ❌ |
| | Edit / delete own, **approved or denied** | ✅ | ❌ | ❌ | ❌ |
| | Edit / delete someone else's | ✅ | ❌ | ❌ | ❌ |
| | Approve / deny, admin notes | ✅ | ❌ | ❌ | ❌ |
| | Read admin notes | ✅ | ❌ | ❌ | ❌ |
| **Profile** | View / edit own | ✅ | ✅ | ✅ | ❌ |
| | View / edit someone else's | ✅ | ❌ | ❌ | ❌ |
| **Projects** | View list | ✅ | **scoped** | **scoped** | ❌ |
| | View one | ✅ | own projects | own projects | ❌ |
| | Create / edit / delete | ✅ | ❌ | ❌ | ❌ |
| | Manage members, list staff | ✅ | ❌ | ❌ | ❌ |
| **Reports** | View / create / generate / delete | ✅ | ❌ | ❌ | ❌ |
| **Accounts** | View / create / edit / delete | ✅ | ❌ | ❌ | ❌ |

Notes on the rows that are easy to misread:

- **Donations and expenses are visible to members, writable only by admins**
  (donations) or by their own author (expenses). "Scoped" lists are filtered in
  SQL and the pagination count is filtered with them, so a total the caller may
  not read is never returned.
- **A decided expense is frozen.** The author may revise their own submission
  right up until an admin approves or denies it; after that only an admin can
  touch it. `needs_more_info` deliberately stays open, because its whole purpose
  is to send the expense back for a correction. The UI shows whichever denial
  message applies — "Approved expenses…" or "Denied expenses…".
- **Directors lost project editing.** They may read the projects they direct and
  the donor roster; every project mutation is admin-only.
- **An author keeps access to what they filed** even after leaving the project,
  which is why `expense:view` has an author clause on top of membership.

## Using it

```ts
import { can, authorize, denialReason } from '@branch/rbac';

can(subject, 'reports:view');                        // global action
can(subject, 'expense:update', expenseResource);     // record-scoped
authorize(subject, 'project:view', { projectId }).reason;
```

Resource-scoped actions are listed in `ResourceMap`; the variadic signature
makes a forgotten resource a **compile error**, and a resource that arrives
`undefined` at runtime is a hard deny rather than a rule evaluated against
nothing. `RESOURCE_MAP_IS_COMPLETE` pins that hand-written map to the table
itself, so a `scoped` entry cannot go missing from it and quietly widen into a
`GlobalAction` that denies every request to its route.

### Backend

Routes declare their gate and `dispatch` enforces it before the controller runs:

```ts
{ method: 'GET', pattern: '/reports', permission: 'reports:view', handler: listReports }
{ method: 'GET', pattern: '/projects/:id', access: 'authenticated', handler: getProject }
{ method: 'POST', pattern: '/auth/login', access: 'public', handler: login }
```

The `Route` type is a union with no "unspecified" arm, so omitting the gate is a
type error. `permission` is restricted to `GlobalAction` — anything needing the
record is checked in the controller with `requirePermission(...)` once the row
is loaded.

### Frontend

```tsx
const { can, why } = usePermissions();

<Can action="donors:delete">…</Can>              // hide what they cannot see
<GatedButton action="donors:create">New</GatedButton>  // grey out, tooltip = the policy's reason
```

## Changing the policy

Edit `POLICY` in `src/policy.ts` and update the matrix above in the same change.
`test/policy.test.ts` is the executable version of this table — it asserts that
admins pass everything, anonymous callers pass nothing, every denial carries a
reason, and that scoped actions fail closed without a resource.
