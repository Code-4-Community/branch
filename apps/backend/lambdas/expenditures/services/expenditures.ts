import { Insertable, Updateable } from 'kysely';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DB } from '@branch/types';
import { db, recordExpenditure, editExpenditure, removeExpenditure } from '@branch/store';
import type { ExpenditureStatus } from '../validation-utils';
import { applyExpenditureScope, type ExpenditureScope } from './scope';

const REGION = process.env.AWS_REGION ?? 'us-east-2';
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';
// SDK default signs a checksum of the presigner's empty body; real bytes then fail the PUT.
const s3 = new S3Client({ region: REGION, requestChecksumCalculation: 'WHEN_REQUIRED' });

// Receipts are PDFs only, matching the dropzone in AddExpenseModal.
export const RECEIPT_CONTENT_TYPE = 'application/pdf';

// Receipts live in the same bucket as reports, under their own prefix.
export function receiptKeyFromUrl(objectUrl: string): string | null {
  const match = objectUrl.match(/^https:\/\/[^/]+\/(receipts\/.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The key only if it sits under this project's prefix, so one project's row cannot name another's receipt. */
export function receiptKeyForProject(objectUrl: string, projectId: number): string | null {
  const key = receiptKeyFromUrl(objectUrl);
  return key && key.startsWith(`receipts/${projectId}/`) && !key.includes('..') ? key : null;
}

export async function countExpenditures(projectId: number | null, scope: ExpenditureScope): Promise<number> {
  let query = db
    .selectFrom('branch.expenditures')
    .where('deleted_at', 'is', null)
    .select(db.fn.count('expenditure_id').as('count'));
  if (projectId !== null) query = query.where('project_id', '=', projectId);
  const totalCount = await applyExpenditureScope(query, scope).executeTakeFirst();

  return Number(totalCount?.count || 0);
}

export async function queryExpenditures(
  projectId: number | null,
  scope: ExpenditureScope,
  page?: { limit: number; offset: number },
) {
  let query = db.selectFrom('branch.expenditures').where('deleted_at', 'is', null).selectAll();
  if (projectId !== null) query = query.where('project_id', '=', projectId);
  const scoped = applyExpenditureScope(query, scope)
    .orderBy('spent_on', 'desc')
    .orderBy('expenditure_id', 'desc');

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
  return db
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .where('deleted_at', 'is', null)
    .selectAll()
    .executeTakeFirst();
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
    .leftJoin('branch.users as u', (join) =>
      join.onRef('u.user_id', '=', 'e.entered_by').on('u.deleted_at', 'is', null),
    )
    .where('e.expenditure_id', '=', id)
    .where('e.deleted_at', 'is', null)
    .where('p.deleted_at', 'is', null)
    .selectAll('e')
    .select(['p.name as project_name', 'u.name as submitted_by_name'])
    .executeTakeFirst();
}

export async function insertExpenditure(values: Insertable<DB['branch.expenditures']>): Promise<void> {
  await recordExpenditure(values);
}

export async function findExpenditureById(id: number) {
  return db
    .selectFrom('branch.expenditures')
    .where('expenditure_id', '=', id)
    .where('deleted_at', 'is', null)
    .selectAll()
    .executeTakeFirst();
}

/** `expectedStatus` is the status the caller was authorized against; a change under the lock throws. */
export async function deleteExpenditureById(id: number, expectedStatus: string): Promise<bigint> {
  return removeExpenditure(id, expectedStatus);
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
export async function updateExpenditure(id: number, values: ExpenditureEdit, expectedStatus: string) {
  if (Object.keys(values).length === 0) return undefined;
  return editExpenditure(id, values, expectedStatus);
}

export async function getUserContact(userId: number) {
  return db
    .selectFrom('branch.users')
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .select(['name', 'email'])
    .executeTakeFirst();
}

/** Returns the updated row, or `undefined` when no row carries that id. */
export async function updateExpenditureStatus(
  id: number,
  status: ExpenditureStatus,
  adminNotes: string | undefined,
) {
  return editExpenditure(
    id,
    adminNotes === undefined ? { status } : { status, admin_notes: adminNotes },
  );
}

/** Same rule as report uploads: basename only, URL-safe characters only. */
export function safeReceiptFileName(fileName: string): string | null {
  const safe = fileName.replace(/^.*[\\/]/, '').replace(/[^A-Za-z0-9._-]/g, '_');
  return /[A-Za-z0-9]/.test(safe) ? safe : null;
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
