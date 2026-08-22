import { Transaction } from 'kysely';
import type { DB } from '@branch/types';
import db from '../db';
import { MemberAssignment } from '../validation-utils';

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

/**
 * Per-project spend and headcount, aggregated in two grouped queries rather
 * than one query per project — the list page renders every project the caller
 * can see, so a per-row lookup is an N+1 that grows with the org.
 */
export async function loadProjectAggregates(projectIds: number[]): Promise<{
  spent: Map<number, number>;
  members: Map<number, number>;
}> {
  if (projectIds.length === 0) return { spent: new Map(), members: new Map() };

  const [spentRows, memberRows] = await Promise.all([
    db
      .selectFrom('branch.expenditures')
      .select(['project_id', db.fn.sum('amount').as('total')])
      .where('project_id', 'in', projectIds)
      .groupBy('project_id')
      .execute(),
    db
      .selectFrom('branch.project_memberships')
      .select(['project_id', db.fn.count('user_id').as('count')])
      .where('project_id', 'in', projectIds)
      .groupBy('project_id')
      .execute(),
  ]);

  return {
    spent: indexByProject(spentRows, (r) => Number(r.total ?? 0)),
    members: indexByProject(memberRows, (r) => Number(r.count ?? 0)),
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

/**
 * Replaces a project's roster with `members` inside the caller's transaction.
 *
 * Delete-then-insert rather than a diff: the set is small and bounded by the
 * staff list, and doing it in one transaction means a failed insert cannot
 * leave the project with nobody assigned.
 */
export async function syncMemberships(
  trx: Transaction<DB>,
  projectId: number,
  members: MemberAssignment[],
): Promise<void> {
  await trx
    .deleteFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .execute();

  if (members.length === 0) return;

  await trx
    .insertInto('branch.project_memberships')
    .values(
      members.map((m) => ({
        project_id: projectId,
        user_id: m.user_id,
        role: m.role,
      })),
    )
    .execute();
}

/** Rejects member ids that are not real users, so FK errors never reach the client as a 500. */
export async function findUnknownUserIds(members: MemberAssignment[]): Promise<number[]> {
  if (members.length === 0) return [];
  const ids = members.map((m) => m.user_id);
  const found = await db
    .selectFrom('branch.users')
    .select('user_id')
    .where('user_id', 'in', ids)
    .execute();
  const known = new Set(found.map((r) => r.user_id));
  return ids.filter((id) => !known.has(id));
}
