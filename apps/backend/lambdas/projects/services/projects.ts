import { Transaction } from 'kysely';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { DB } from '@branch/types';
import db from '../db';
import { APPROVED_EXPENDITURE_STATUS, DEFAULT_PROJECT_ROLE, MemberAssignment } from '../validation-utils';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });

/** Deletes every object under one prefix, following pagination. */
async function deletePrefix(bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  let ContinuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));

    if (keys.length > 0) {
      // DeleteObjects caps at 1000 keys, which is also ListObjectsV2's page
      // size, so one page maps to one delete call.
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      removed += keys.length;
    }

    // Only follow the cursor while truncated; IsTruncated false ends the loop.
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return removed;
}

/**
 * Best-effort cleanup of the files a deleted project owned.
 *
 * Deliberately never throws: the project is already gone by the time this runs,
 * and a delete that succeeded must not be reported as a 500 because S3 was
 * unreachable or the role is missing `s3:DeleteObject`. Leftover objects are
 * recoverable; a project that cannot be deleted is not.
 */
export async function deleteProjectObjects(projectId: number): Promise<number | null> {
  // Read at call time rather than at module load: the value is then observable
  // to callers that set it after import, which is what the unit tests do.
  const bucket = process.env.REPORTS_BUCKET_NAME ?? '';
  if (!bucket) {
    console.error('REPORTS_BUCKET_NAME is not set; leaving files for project', projectId);
    return null;
  }
  try {
    const counts = await Promise.all([
      deletePrefix(bucket, `receipts/${projectId}/`),
      deletePrefix(bucket, `reports/${projectId}/`),
    ]);
    return counts[0] + counts[1];
  } catch (err) {
    console.error('Failed to delete objects for project', projectId, err);
    return null;
  }
}

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

/**
 * Replaces a project's roster with `members` inside the caller's transaction.
 *
 * Delete-then-insert rather than a diff: the set is small and bounded by the
 * staff list, and doing it in one transaction means a failed insert cannot
 * leave the project with nobody assigned.
 *
 * An entry with no `role` keeps the role that member already held. The staff
 * picker submits bare ids, and "Director" is derived from these rows, so
 * defaulting them all to Student would make every ordinary project edit strip
 * the project's directors of their role.
 */
export async function syncMemberships(
  trx: Transaction<DB>,
  projectId: number,
  members: MemberAssignment[],
): Promise<void> {
  const existing = await trx
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .select(['user_id', 'role'])
    .execute();
  const heldRole = new Map(existing.map((row) => [row.user_id, row.role]));

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
        role: m.role ?? heldRole.get(m.user_id) ?? DEFAULT_PROJECT_ROLE,
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
