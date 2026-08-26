import { Insertable, Updateable } from 'kysely';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { reportError } from '@branch/lambda-http';
import type { DB } from '@branch/types';
import db from '../db';
import type { ExpenditureStatus } from '../validation-utils';
import { applyExpenditureScope, type ExpenditureScope } from './scope';

const REGION = process.env.AWS_REGION ?? 'us-east-2';
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';
const s3 = new S3Client({ region: REGION });

// Receipts are PDFs only, matching the dropzone in AddExpenseModal.
export const RECEIPT_CONTENT_TYPE = 'application/pdf';

// Receipts live in the same bucket as reports, under their own prefix.
export function receiptKeyFromUrl(objectUrl: string): string | null {
  const match = objectUrl.match(/^https:\/\/[^/]+\/(receipts\/.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Best-effort removal of the receipt behind a deleted expenditure.
 *
 * Deliberately never throws: the row is already gone by the time this runs, and
 * the caller must not turn a successful delete into a 500 because S3 was
 * unreachable or the role is missing `s3:DeleteObject`. A leftover object is
 * recoverable; a row that cannot be deleted is not.
 */
export async function deleteReceiptObject(receiptUrl: string | null): Promise<boolean> {
  if (!receiptUrl) return true;
  const key = receiptKeyFromUrl(receiptUrl);
  if (!key) return false;
  // Read at call time rather than using the module-level BUCKET: the value is
  // then observable to callers that set it after import, which is what the
  // unit tests do.
  const bucket = process.env.REPORTS_BUCKET_NAME ?? '';
  if (!bucket) {
    console.error('REPORTS_BUCKET_NAME is not set; leaving receipt object', key);
    return false;
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error('Failed to delete receipt object', key, err);
    reportError(err, { key });
    return false;
  }
}

export async function countExpenditures(projectId: number | null, scope: ExpenditureScope): Promise<number> {
  // Only the unscoped count can come from the rollup. A scoped one is
  // `project_id IN (...) OR entered_by = me`, and entered_by is not in the
  // grain, so summing buckets would double-count rows matching both arms.
  if (scope.projectIds === null) {
    let rollup = db
      .selectFrom('branch.expenditure_rollup')
      .select(db.fn.sum('expenditure_count').as('count'));
    if (projectId !== null) rollup = rollup.where('project_id', '=', projectId);
    const rolledUp = await rollup.executeTakeFirst();

    return Number(rolledUp?.count || 0);
  }

  let query = db.selectFrom('branch.expenditures').select(db.fn.count('expenditure_id').as('count'));
  if (projectId !== null) query = query.where('project_id', '=', projectId);
  const totalCount = await applyExpenditureScope(query, scope).executeTakeFirst();

  return Number(totalCount?.count || 0);
}

export async function queryExpenditures(
  projectId: number | null,
  scope: ExpenditureScope,
  page?: { limit: number; offset: number },
) {
  let query = db.selectFrom('branch.expenditures').selectAll();
  if (projectId !== null) query = query.where('project_id', '=', projectId);
  const scoped = applyExpenditureScope(query, scope).orderBy('spent_on', 'desc');

  return page ? scoped.limit(page.limit).offset(page.offset).execute() : scoped.execute();
}

export async function findMembership(projectId: number, userId: number) {
  return db
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .select('role')
    .executeTakeFirst();
}

export async function findProjectById(projectId: number) {
  return db.selectFrom('branch.projects').where('project_id', '=', projectId).selectAll().executeTakeFirst();
}

/**
 * The row plus the two names the detail view renders, in one round trip.
 *
 * `projects` is an inner join because `project_id` is NOT NULL behind a foreign
 * key, so it can never drop the row; `users` is a left join because
 * `entered_by` is nullable.
 */
export async function findExpenditureWithNames(id: number) {
  return db
    .selectFrom('branch.expenditures as e')
    .innerJoin('branch.projects as p', 'p.project_id', 'e.project_id')
    .leftJoin('branch.users as u', 'u.user_id', 'e.entered_by')
    .where('e.expenditure_id', '=', id)
    .selectAll('e')
    .select(['p.name as project_name', 'u.name as submitted_by_name'])
    .executeTakeFirst();
}

export async function insertExpenditure(values: Insertable<DB['branch.expenditures']>): Promise<void> {
  await db.insertInto('branch.expenditures').values(values).executeTakeFirst();
}

export async function findExpenditureById(id: number) {
  return db.selectFrom('branch.expenditures').where('expenditure_id', '=', id).selectAll().executeTakeFirst();
}

export async function deleteExpenditureById(id: number): Promise<bigint> {
  const deleted = await db.deleteFrom('branch.expenditures').where('expenditure_id', '=', id).execute();
  return deleted[0]?.numDeletedRows ?? 0n;
}

/**
 * The author's own edit. Deliberately cannot reach `status`, `admin_notes` or
 * `entered_by` — those are the admin's fields and the audit trail, and a
 * whitelist here is what keeps `expense:review` from being bypassable by
 * sending extra keys to the edit route.
 */
export type ExpenditureEdit = Pick<
  Updateable<DB['branch.expenditures']>,
  'amount' | 'category' | 'description' | 'receipt_url' | 'spent_on'
>;

/**
 * Returns the row as it now stands, so the caller does not have to read it back.
 * `undefined` when there was nothing to set (the caller already holds the row)
 * or when no row matched the id.
 */
export async function updateExpenditure(id: number, values: ExpenditureEdit) {
  if (Object.keys(values).length === 0) return undefined;
  return db
    .updateTable('branch.expenditures')
    .set(values)
    .where('expenditure_id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

export async function getUserContact(userId: number) {
  return db
    .selectFrom('branch.users')
    .where('user_id', '=', userId)
    .select(['name', 'email'])
    .executeTakeFirst();
}

/** Returns the updated row, or `undefined` when no row carries that id. */
export async function updateExpenditureStatus(
  id: number,
  status: ExpenditureStatus,
  adminNotes: string | undefined,
) {
  return db
    .updateTable('branch.expenditures')
    .set(adminNotes === undefined ? { status } : { status, admin_notes: adminNotes })
    .where('expenditure_id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

export async function presignUploadUrl(projectId: number, fileName: string): Promise<{ uploadUrl: string; objectUrl: string }> {
  const key = `receipts/${projectId}/${Date.now()}-${fileName}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: RECEIPT_CONTENT_TYPE,
  }), { expiresIn: 3600 });

  return {
    uploadUrl,
    objectUrl: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
  };
}

export async function presignReceiptDownload(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
}
