import { Insertable } from 'kysely';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DB } from '@branch/types';
import db from '../db';
import type { ExpenditureStatus } from '../validation-utils';

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

export async function countExpenditures(projectId: number | null): Promise<number> {
  const totalCount = projectId !== null
    ? await db.selectFrom('branch.expenditures').where('project_id', '=', projectId).select(db.fn.count('expenditure_id').as('count')).executeTakeFirst()
    : await db.selectFrom('branch.expenditures').select(db.fn.count('expenditure_id').as('count')).executeTakeFirst();

  return Number(totalCount?.count || 0);
}

export async function queryExpenditures(projectId: number | null, page?: { limit: number; offset: number }) {
  if (page) {
    return projectId !== null
      ? db.selectFrom('branch.expenditures').where('project_id', '=', projectId).selectAll().orderBy('spent_on', 'desc').limit(page.limit).offset(page.offset).execute()
      : db.selectFrom('branch.expenditures').selectAll().orderBy('spent_on', 'desc').limit(page.limit).offset(page.offset).execute();
  }

  return projectId !== null
    ? db.selectFrom('branch.expenditures').where('project_id', '=', projectId).selectAll().orderBy('spent_on', 'desc').execute()
    : db.selectFrom('branch.expenditures').selectAll().orderBy('spent_on', 'desc').execute();
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

export async function findProjectName(projectId: number): Promise<string | undefined> {
  const row = await db.selectFrom('branch.projects').where('project_id', '=', projectId).select(['name']).executeTakeFirst();
  return row?.name;
}

export async function findUserName(userId: number): Promise<string | undefined> {
  const row = await db.selectFrom('branch.users').where('user_id', '=', userId).select(['name']).executeTakeFirst();
  return row?.name;
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

export async function updateExpenditureStatus(
  id: number,
  status: ExpenditureStatus,
  adminNotes: string | undefined,
): Promise<void> {
  await db
    .updateTable('branch.expenditures')
    .set(adminNotes === undefined ? { status } : { status, admin_notes: adminNotes })
    .where('expenditure_id', '=', id)
    .execute();
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
