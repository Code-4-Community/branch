import type { DB } from '@branch/types';
import { db } from '@branch/store';
import { ADMIN_MEMBER_ROLE, type MemberDisplayRole } from '@branch/rbac';
import { APPROVED_EXPENDITURE_STATUS, MemberAssignment } from '../validation-utils';

/**
 * Path segments carrying a project id are matched with this rather than a bare
 * "is there a segment here" check. Without it `/projects/assignable-staff`
 * matches `GET /projects/{id}` with `id = "assignable-staff"`, which reaches
 * the DB as `NaN` and surfaces as a confusing 403 instead of routing correctly.
 */
export function projectIdFrom(segment: string | undefined): number | null {
  if (!segment || !/^\d+$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * `pg` hands back DATE columns as `Date`, but every date the API accepts and
 * returns is a `YYYY-MM-DD` string, so comparisons must go through this.
 */
export function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Rows keyed by project id, for stitching aggregates onto a project list. */
export function indexByProject<T extends { project_id: number }>(
  rows: T[],
  pick: (row: T) => number,
): Map<number, number> {
  return new Map(rows.map((row) => [row.project_id, pick(row)]));
}

/** Per-project spend and headcount, read from the trigger-maintained rollups. */
export async function loadProjectAggregates(projectIds: number[]): Promise<{
  spent: Map<number, number>;
  members: Map<number, number>;
}> {
  if (projectIds.length === 0) return { spent: new Map(), members: new Map() };

  const [spentRows, memberRows] = await Promise.all([
    db
      .selectFrom('branch.expenditure_rollup')
      .select(['project_id', db.fn.sum('total_amount').as('total')])
      .where('status', '=', APPROVED_EXPENDITURE_STATUS)
      .where('project_id', 'in', projectIds)
      .groupBy('project_id')
      .execute(),
    db
      .selectFrom('branch.project_rollup')
      .select(['project_id', 'member_count'])
      .where('project_id', 'in', projectIds)
      .execute(),
  ]);

  return {
    spent: indexByProject(spentRows, (r) => Number(r.total ?? 0)),
    members: indexByProject(memberRows, (r) => Number(r.member_count ?? 0)),
  };
}

/**
 * A project is archived once it has an end date that has passed. The "this
 * project is still in progress" checkbox in the UI simply clears `end_date`,
 * so a null end date is always active.
 */
export function isProjectActive(endDate: unknown, today = new Date()): boolean {
  const iso = toIsoDate(endDate);
  if (!iso) return true;
  return iso >= today.toISOString().slice(0, 10);
}

export interface RosterMember {
  user_id: number;
  name: string;
  email: string;
  profile_image: string | null;
  role: MemberDisplayRole;
}

export async function listRoster(projectId: number): Promise<RosterMember[]> {
  const [admins, stored] = await Promise.all([
    db
      .selectFrom('branch.users')
      .select(['user_id', 'name', 'email', 'profile_image'])
      .where('is_admin', 'is', true)
      .where('deleted_at', 'is', null)
      .where('is_staff', 'is not', true)
      .orderBy('name', 'asc')
      .execute(),
    db
      .selectFrom('branch.project_memberships as pm')
      .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
      .select(['u.user_id', 'u.name', 'u.email', 'u.profile_image', 'pm.role'])
      .where('pm.project_id', '=', projectId)
      .where('u.deleted_at', 'is', null)
      .orderBy('u.name', 'asc')
      .execute(),
  ]);

  const adminIds = new Set(admins.map((a) => a.user_id));

  return [
    ...admins.map((a) => ({ ...a, role: ADMIN_MEMBER_ROLE as MemberDisplayRole })),
    ...stored
      .filter((m) => !adminIds.has(m.user_id))
      .map((m) => ({ ...m, role: m.role as MemberDisplayRole })),
  ];
}

export async function loadAdminHeadcount(projectIds: number[]): Promise<{
  admins: number;
  storedAdmins: Map<number, number>;
}> {
  const [totalRow, storedRows] = await Promise.all([
    db
      .selectFrom('branch.users')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('is_admin', 'is', true)
      .where('deleted_at', 'is', null)
      .where('is_staff', 'is not', true)
      .executeTakeFirst(),
    projectIds.length === 0
      ? Promise.resolve([])
      : db
          .selectFrom('branch.project_memberships as pm')
          .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
          .select(['pm.project_id', (eb) => eb.fn.countAll<string>().as('count')])
          .where('u.is_admin', 'is', true)
          .where('u.deleted_at', 'is', null)
          .where('pm.project_id', 'in', projectIds)
          .groupBy('pm.project_id')
          .execute(),
  ]);

  return {
    admins: Number(totalRow?.count ?? 0),
    storedAdmins: indexByProject(storedRows, (r) => Number(r.count ?? 0)),
  };
}

export const ADMIN_ASSIGNMENT_MESSAGE =
  'Admins are on every project and cannot be assigned to one.';

export async function findAdminUserIds(members: MemberAssignment[]): Promise<number[]> {
  if (members.length === 0) return [];
  const admins = await db
    .selectFrom('branch.users')
    .select('user_id')
    .where('is_admin', 'is', true)
    .where('deleted_at', 'is', null)
    .where(
      'user_id',
      'in',
      members.map((m) => m.user_id),
    )
    .execute();
  return admins.map((row) => row.user_id);
}

/** Rejects member ids that are not real users, so FK errors never 500; a staff id counts as unknown so none is confirmed. */
export async function findUnknownUserIds(members: MemberAssignment[]): Promise<number[]> {
  if (members.length === 0) return [];
  const ids = members.map((m) => m.user_id);
  const found = await db
    .selectFrom('branch.users')
    .select('user_id')
    .where('user_id', 'in', ids)
    .where('deleted_at', 'is', null)
    .where('is_staff', 'is not', true)
    .execute();
  const known = new Set(found.map((r) => r.user_id));
  return ids.filter((id) => !known.has(id));
}
