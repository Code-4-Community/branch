import {
  ANONYMOUS,
  RbacSubject,
  isAuthenticated,
  isDirector,
  isMemberOf,
} from './subject';
import {
  DonationResource,
  ExpenseResource,
  ProjectResource,
  UserResource,
  frozenReason,
  isFrozen,
} from './resources';

/**
 * The whole authorization policy, as data.
 *
 * One table, imported by the lambdas and by the browser. A permission cannot
 * drift between the tooltip that greys a button out and the 403 that would have
 * followed, because there is only one of it.
 */

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface Decision {
  allowed: boolean;
  /** Present when denied. Rendered verbatim as the 403 body and the UI tooltip. */
  reason?: string;
}

export const ALLOW: Decision = { allowed: true };

export function deny(reason: string): Decision {
  return { allowed: false, reason };
}

/**
 * A rule may return a bare boolean when there is only one way to fail — the
 * action's default `reason` is used then — or a Decision to explain a specific
 * failure ("already approved" reads very differently from "not yours").
 */
type Rule<R> = (subject: RbacSubject, resource: R) => boolean | Decision;

interface PolicyEntry<R> {
  /** Default denial message. */
  reason: string;
  /** True when the rule reads `resource`; a missing one is then a hard deny. */
  needsResource: boolean;
  rule: Rule<R>;
}

// ---------------------------------------------------------------------------
// Resource typing
// ---------------------------------------------------------------------------

/**
 * Actions that require a resource, and which one. Anything absent here takes no
 * resource, and `authorize` will reject a stray second argument at compile time.
 */
export interface ResourceMap {
  'project:view': ProjectResource;
  'donation:view': DonationResource;
  'expense:view': ExpenseResource;
  'expense:create': ProjectResource;
  'expense:uploadReceipt': ProjectResource;
  'expense:update': ExpenseResource;
  'expense:delete': ExpenseResource;
  'expense:viewReceipt': ExpenseResource;
  'profile:view': UserResource;
  'profile:update': UserResource;
}

// ---------------------------------------------------------------------------
// Shorthands used by the table below
// ---------------------------------------------------------------------------

const admin = (s: RbacSubject) => s.isAdmin;
const adminOrDirector = (s: RbacSubject) => s.isAdmin || isDirector(s);
const authenticated = (s: RbacSubject) => isAuthenticated(s);
const adminOrMember = (s: RbacSubject, r: { projectId: number }) =>
  s.isAdmin || isMemberOf(s, r.projectId);
/**
 * Never `s.userId === r.enteredBy` on its own: both sides are null for an
 * anonymous caller reading a row whose author was deleted, and null === null
 * would hand them the record.
 */
const isAuthor = (s: RbacSubject, r: { enteredBy: number | null }) =>
  s.userId !== null && s.userId === r.enteredBy;
const isSelf = (s: RbacSubject, r: { userId: number }) =>
  s.userId !== null && s.userId === r.userId;

const ADMIN_ONLY = 'Only administrators can do this';
const ADMIN_OR_DIRECTOR = 'Only administrators and project directors can do this';
const MEMBER_ONLY = 'You are not a member of this project';
const SIGN_IN = 'You must be signed in';

function unscoped(
  reason: string,
  rule: Rule<void>,
): PolicyEntry<void> & { needsResource: false } {
  return { reason, needsResource: false, rule };
}

function scoped<R>(
  reason: string,
  rule: Rule<R>,
): PolicyEntry<R> & { needsResource: true } {
  return { reason, needsResource: true, rule };
}

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export const POLICY = {
  // -- Dashboard ------------------------------------------------------------
  'dashboard:view': unscoped(ADMIN_ONLY, admin),

  // -- Donors ---------------------------------------------------------------
  // The page itself is admin + director. Everything that writes a donor is
  // admin, because a donor is global data with no project to scope it to.
  'donors:view': unscoped(ADMIN_OR_DIRECTOR, adminOrDirector),
  'donors:create': unscoped(ADMIN_ONLY, admin),
  'donors:delete': unscoped(ADMIN_ONLY, admin),

  // -- Donations ------------------------------------------------------------
  // The list is reachable by anyone; the rows it returns are filtered to the
  // caller's projects (see visibleProjectIds). Record reads use donation:view.
  'donations:view': unscoped(SIGN_IN, authenticated),
  'donations:create': unscoped(ADMIN_ONLY, admin),
  'donations:delete': unscoped(ADMIN_ONLY, admin),
  'donation:view': scoped<DonationResource>(MEMBER_ONLY, adminOrMember),

  // -- Expenses -------------------------------------------------------------
  'expenses:view': unscoped(SIGN_IN, authenticated),
  /**
   * "Could this person file an expense against *something*?" — the page-level
   * answer, for the New Expense button, before a project has been picked. The
   * per-project decision is `expense:create`, checked once the form has one.
   */
  'expenses:create': unscoped(
    'You are not a member of any project',
    (s) => s.isAdmin || s.memberProjectIds.length > 0,
  ),
  'expense:view': scoped<ExpenseResource>(
    'You can only view expenses on your own projects',
    (s, r) => s.isAdmin || isMemberOf(s, r.projectId) || isAuthor(s, r),
  ),
  'expense:create': scoped<ProjectResource>(MEMBER_ONLY, adminOrMember),
  'expense:uploadReceipt': scoped<ProjectResource>(MEMBER_ONLY, adminOrMember),
  // The author may revise their own expense until an admin decides it. Approved
  // or denied, the row is the record of that decision and only an admin may
  // touch it; `needs_more_info` stays open so they can answer the reviewer.
  'expense:update': scoped<ExpenseResource>(
    'You can only edit expenses you submitted',
    (s, r) => {
      if (s.isAdmin) return true;
      if (!isAuthor(s, r)) return false;
      if (isFrozen(r)) return deny(frozenReason(r, 'edited'));
      return true;
    },
  ),
  'expense:delete': scoped<ExpenseResource>(
    'You can only delete expenses you submitted',
    (s, r) => {
      if (s.isAdmin) return true;
      if (!isAuthor(s, r)) return false;
      if (isFrozen(r)) return deny(frozenReason(r, 'deleted'));
      return true;
    },
  ),
  'expense:viewReceipt': scoped<ExpenseResource>(
    'You can only view receipts on your own projects',
    (s, r) => s.isAdmin || isMemberOf(s, r.projectId) || isAuthor(s, r),
  ),
  /** Approval status and admin notes — the two fields only an admin may touch. */
  'expense:review': unscoped(ADMIN_ONLY, admin),
  'expense:viewAdminNotes': unscoped(ADMIN_ONLY, admin),

  // -- Profile --------------------------------------------------------------
  // Open to everyone, but only for their own row.
  'profile:view': scoped<UserResource>(
    'You can only view your own profile',
    (s, r) => s.isAdmin || isSelf(s, r),
  ),
  'profile:update': scoped<UserResource>(
    'You can only edit your own profile',
    (s, r) => s.isAdmin || isSelf(s, r),
  ),

  // -- Projects -------------------------------------------------------------
  // Listing is open; the rows are scoped to membership. Every mutation is
  // admin-only, directors included.
  'projects:view': unscoped(SIGN_IN, authenticated),
  'project:view': scoped<ProjectResource>(MEMBER_ONLY, adminOrMember),
  'project:create': unscoped(ADMIN_ONLY, admin),
  'project:update': unscoped(ADMIN_ONLY, admin),
  'project:delete': unscoped(ADMIN_ONLY, admin),
  'project:manageMembers': unscoped(ADMIN_ONLY, admin),
  /** The staff picker's roster. Admin-only now that only admins edit projects. */
  'staff:list': unscoped(ADMIN_ONLY, admin),

  // -- Reports --------------------------------------------------------------
  'reports:view': unscoped(ADMIN_ONLY, admin),
  'reports:create': unscoped(ADMIN_ONLY, admin),
  'reports:generate': unscoped(ADMIN_ONLY, admin),
  'reports:delete': unscoped(ADMIN_ONLY, admin),

  // -- Accounts (user administration) ---------------------------------------
  'accounts:view': unscoped(ADMIN_ONLY, admin),
  'accounts:create': unscoped(ADMIN_ONLY, admin),
  'accounts:update': unscoped(ADMIN_ONLY, admin),
  'accounts:delete': unscoped(ADMIN_ONLY, admin),
} satisfies Record<string, PolicyEntry<any>>;

export type Action = keyof typeof POLICY;

export const ACTIONS = Object.keys(POLICY) as Action[];

/** Actions whose own entry declares that its rule reads a resource. */
export type ScopedAction = {
  [K in Action]: (typeof POLICY)[K]['needsResource'] extends true ? K : never;
}[Action];

/**
 * Actions that need no resource. Route tables may only declare one of these:
 * a resource-scoped permission has nothing to evaluate against at the routing
 * layer and would fail closed on every request.
 */
export type GlobalAction = Exclude<Action, ScopedAction>;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * `ResourceMap` is hand-written, so this pins it to the table it describes. A
 * `scoped` entry missing from the map would otherwise widen into a
 * `GlobalAction`, become legal in a route table, and then deny every single
 * request to that route — fail-closed, but silently.
 */
export const RESOURCE_MAP_IS_COMPLETE: Exactly<ScopedAction, keyof ResourceMap> =
  true;

/** The resource an action needs, or `void` when it is global. */
export type ResourceOf<A extends Action> = A extends keyof ResourceMap
  ? ResourceMap[A]
  : void;

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** The trailing argument list an action takes: `[]` when it is global. */
export type ResourceArgs<A extends Action> = ResourceOf<A> extends void
  ? []
  : [ResourceOf<A>];

/**
 * The untyped core. Callers that hold an `Action` in a variable — a route
 * table, a page-permission lookup, a `<Can>` element — cannot satisfy the
 * variadic signature below, and this spares every one of them an `any` cast.
 */
export function authorizeAny(
  subject: RbacSubject | null | undefined,
  action: string,
  resource?: unknown,
): Decision {
  const entry = (POLICY as Record<string, PolicyEntry<unknown> | undefined>)[action];
  if (!entry) return deny('Unknown action');

  const s = subject ?? ANONYMOUS;

  // Fail closed. A caller that forgot the resource must not get a rule
  // evaluated against `undefined`, which reads as "no project" and can be
  // truthy for the wrong reason.
  if (entry.needsResource && (resource === undefined || resource === null)) {
    return deny(entry.reason);
  }

  const verdict = entry.rule(s, resource);
  if (verdict === true) return ALLOW;
  if (verdict === false) return deny(entry.reason);
  return verdict.allowed ? ALLOW : deny(verdict.reason ?? entry.reason);
}

/**
 * The one entry point. Every gate in the system — route guards, controller
 * record checks, disabled buttons, hidden nav links — resolves through here.
 *
 * The variadic tail is what makes a forgotten resource a compile error rather
 * than a silent denial at runtime.
 */
export function authorize<A extends Action>(
  subject: RbacSubject | null | undefined,
  action: A,
  ...args: ResourceArgs<A>
): Decision {
  return authorizeAny(subject, action, (args as unknown[])[0]);
}

export function can<A extends Action>(
  subject: RbacSubject | null | undefined,
  action: A,
  ...args: ResourceArgs<A>
): boolean {
  return authorizeAny(subject, action, (args as unknown[])[0]).allowed;
}

/** The tooltip text for a denied action, or `undefined` when it is allowed. */
export function denialReason<A extends Action>(
  subject: RbacSubject | null | undefined,
  action: A,
  ...args: ResourceArgs<A>
): string | undefined {
  const decision = authorizeAny(subject, action, (args as unknown[])[0]);
  return decision.allowed ? undefined : decision.reason;
}
