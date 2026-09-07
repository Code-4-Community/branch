import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { json, parseBody, reportError, serverError } from '@branch/lambda-http';
import type { RouteHandler } from '@branch/lambda-http';
import { METRICS, recordEvent, recordValue } from '@branch/lambda-telemetry';
import db from '../db';
import {
  fetchReportData,
  generatePdf,
  generateDocx,
  uploadToS3,
  saveReportRecord,
  objectUrlFor,
  keyFromObjectUrl,
  reportKeyPrefix,
  getObjectSize,
} from '../report-service';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });
const BUCKET = process.env.REPORTS_BUCKET_NAME ?? '';

const ALLOWED_EXTENSIONS = ['pdf', 'docx'] as const;
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const REPORT_TYPES = ['technical', 'narrative'] as const;
const DOWNLOAD_URL_TTL_SECONDS = 900;

type FileType = typeof ALLOWED_EXTENSIONS[number];
type ReportType = typeof REPORT_TYPES[number];

// Reports are admin-only end to end: every route carries a `reports:*`
// permission and dispatch enforces it before these run.

// Numeric-only id, mirroring the old REPORT_ID_ROUTE/REPORT_DOWNLOAD_ROUTE regexes
// so a non-numeric :id falls through to the same 404 as an unmatched route.
/**
 * Best-effort removal of the generated file behind a deleted report.
 *
 * Deliberately never throws: the row is already gone by the time this runs, and
 * the caller must not turn a successful delete into a 500 because S3 was
 * unreachable or the role is missing `s3:DeleteObject`. A leftover object is
 * recoverable; a row that cannot be deleted is not.
 */
async function deleteReportObject(objectUrl: string | null): Promise<boolean> {
  if (!objectUrl) return true;
  const key = keyFromObjectUrl(objectUrl);
  if (!key) return false;
  // Read at call time rather than using the module-level BUCKET: the value is
  // then observable to callers that set it after import, which is what the
  // unit tests do.
  const bucket = process.env.REPORTS_BUCKET_NAME ?? '';
  if (!bucket) {
    console.error('REPORTS_BUCKET_NAME is not set; leaving report object', key);
    return false;
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error('Failed to delete report object', key, err);
    reportError(err, { key });
    return false;
  }
}

function notFoundUnlessNumericId(id: string, path: string, method: string) {
  return /^\d+$/.test(id) ? undefined : json(404, { message: 'Not Found', path, method });
}

export const generateReport: RouteHandler = async ({ event }) => {
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  const projectId = body.project_id;
  if (projectId === undefined || projectId === null) {
    return json(400, { message: 'project_id is required' });
  }
  if (typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId <= 0) {
    return json(400, { message: 'project_id must be a positive integer' });
  }

  const fileType = (body.file_type ?? 'pdf') as FileType;
  if (!ALLOWED_EXTENSIONS.includes(fileType)) {
    return json(400, { message: `file_type must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` });
  }

  const reportType = (body.report_type ?? 'technical') as ReportType;
  if (!REPORT_TYPES.includes(reportType)) {
    return json(400, { message: `report_type must be one of: ${REPORT_TYPES.join(', ')}` });
  }

  // Optional. Falls back to the auto-generated "<project> — <date>" title
  // below when omitted or blank, so this is fully backward compatible with
  // any caller that never sends it.
  const customTitle = typeof body.title === 'string' ? body.title.trim() : '';

  const reportData = await fetchReportData(projectId);
  if (!reportData) {
    return json(404, { message: 'Project not found' });
  }

  // The slowest path here, and the one nearest the 30s lambda timeout.
  const renderStartedAt = Date.now();
  const kind = { report_type: reportType, file_type: fileType };

  let fileBuffer: Buffer;
  try {
    fileBuffer = fileType === 'docx' ? await generateDocx(reportData) : await generatePdf(reportData);
  } catch (err) {
    recordEvent(METRICS.REPORT_GENERATED, { ...kind, outcome: 'render_failed' });
    return serverError(err, 'Failed to generate report');
  }
  recordValue(METRICS.REPORT_DURATION, Date.now() - renderStartedAt, kind);

  let objectUrl: string;
  try {
    objectUrl = await uploadToS3(fileBuffer, projectId, fileType);
  } catch (err) {
    recordEvent(METRICS.REPORT_GENERATED, { ...kind, outcome: 'upload_failed' });
    return serverError(err, 'Failed to upload report');
  }

  const title = customTitle || `${reportData.project.name} — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  const record = await saveReportRecord(projectId, objectUrl, title, reportType);

  recordEvent(METRICS.REPORT_GENERATED, { ...kind, outcome: 'success' });
  recordValue(METRICS.REPORT_SIZE, fileBuffer.byteLength, kind);

  return json(201, {
    ok: true,
    report_id: record.report_id,
    object_url: record.object_url,
    report_type: record.report_type,
    file_type: fileType,
  });
};

export const listReports: RouteHandler = async ({ event }) => {
  const queryParams = event.queryStringParameters || {};
  const pageStr = queryParams.page as string | undefined;
  const limitStr = queryParams.limit as string | undefined;
  const projectIdStr = queryParams.projectId as string | undefined;

  if (pageStr !== undefined) {
    if (!/^\d+$/.test(pageStr) || parseInt(pageStr, 10) < 1) {
      return json(400, { message: 'page must be a positive integer' });
    }
  }

  if (limitStr !== undefined) {
    if (!/^\d+$/.test(limitStr) || parseInt(limitStr, 10) < 1) {
      return json(400, { message: 'limit must be a positive integer' });
    }
  }

  if (projectIdStr !== undefined) {
    if (!/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
      return json(400, { message: 'projectId must be a positive integer' });
    }
  }

  const page = pageStr ? parseInt(pageStr, 10) : null;
  const limit = limitStr ? parseInt(limitStr, 10) : null;
  const projectId = projectIdStr ? parseInt(projectIdStr, 10) : null;

  if (page && limit) {
    const offset = (page - 1) * limit;

    // Count from the rollup, not a scan of `reports`. No reports reads 0, and an
    // unknown project has no row — both yield 0, as COUNT(*) did.
    const countPromise = projectId !== null
      ? db.selectFrom('branch.project_rollup').where('project_id', '=', projectId).select('report_count as count').executeTakeFirst()
      : db.selectFrom('branch.project_rollup').select(db.fn.sum('report_count').as('count')).executeTakeFirst();

    let pageQuery = db.selectFrom('branch.reports').selectAll().orderBy('date_created', 'desc');
    if (projectId !== null) pageQuery = pageQuery.where('project_id', '=', projectId);

    const [totalCount, reports] = await Promise.all([
      countPromise,
      pageQuery.limit(limit).offset(offset).execute(),
    ]);

    const totalItems = Number(totalCount?.count || 0);
    const totalPages = Math.ceil(totalItems / limit);

    return json(200, {
      data: await withSizes(reports),
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const reports = projectId !== null
    ? await db.selectFrom('branch.reports').where('project_id', '=', projectId).selectAll().orderBy('date_created', 'desc').execute()
    : await db.selectFrom('branch.reports').selectAll().orderBy('date_created', 'desc').execute();

  return json(200, { data: reports });
};

export const getUploadUrl: RouteHandler = async ({ event }) => {
  const queryParams = event.queryStringParameters || {};
  const { fileName, projectId: projectIdStr } = queryParams;

  if (!fileName || typeof fileName !== 'string') {
    return json(400, { message: 'fileName is required' });
  }
  const safeFileName = fileName.replace(/^.*[\\/]/, '').replace(/[^A-Za-z0-9._-]/g, '_');
  if (!/[A-Za-z0-9]/.test(safeFileName)) {
    return json(400, { message: 'Invalid fileName' });
  }
  const ext = safeFileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return json(400, { message: 'Only PDF and DOCX files are supported' });
  }
  if (!projectIdStr || !/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
    return json(400, { message: 'projectId must be a positive integer' });
  }
  const projectId = parseInt(projectIdStr, 10);

  const projectExists = await db.selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .select('project_id')
    .executeTakeFirst();
  if (!projectExists) return json(404, { message: 'Project not found' });

  const key = `${reportKeyPrefix(projectId)}${Date.now()}-${safeFileName}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: MIME_TYPES[ext],
  }), { expiresIn: 3600 });

  return json(200, { uploadUrl, objectUrl: objectUrlFor(key) });
};

export const createReport: RouteHandler = async ({ event }) => {
  const body = parseBody(event);
  if (body === null) {
    return json(400, { message: 'Invalid JSON in request body' });
  }

  const { title, projectId, objectUrl, reportType } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return json(400, { message: 'title is required' });
  }
  if (!projectId || typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId < 1) {
    return json(400, { message: 'projectId must be a positive integer' });
  }
  if (!objectUrl || typeof objectUrl !== 'string') {
    return json(400, { message: 'objectUrl is required' });
  }
  const postedKey = keyFromObjectUrl(objectUrl);
  if (!postedKey) {
    return json(400, { message: 'objectUrl must point at the reports bucket' });
  }
  const resolvedReportType: ReportType = (reportType && REPORT_TYPES.includes(reportType as ReportType)) ? reportType as ReportType : 'technical';

  const projectExists = await db.selectFrom('branch.projects')
    .where('project_id', '=', projectId as number)
    .select('project_id')
    .executeTakeFirst();
  if (!projectExists) return json(404, { message: 'Project not found' });

  // Checked after authorization: the key must sit under this project's prefix,
  // or a caller with access to one project could register another project's
  // object and then read it back through GET /reports/{id}/download.
  if (!postedKey.startsWith(reportKeyPrefix(projectId))) {
    return json(400, { message: "objectUrl must point at this project's prefix in the reports bucket" });
  }

  const report = await db
    .insertInto('branch.reports')
    .values({ project_id: projectId, title: (title as string).trim(), object_url: objectUrl as string, report_type: resolvedReportType })
    .returningAll()
    .executeTakeFirst();

  return json(201, report);
};

export const downloadReport: RouteHandler = async ({ params, path, method }) => {
  const notFound = notFoundUnlessNumericId(params.id, path, method);
  if (notFound) return notFound;
  const id = params.id;

  const report = await db.selectFrom('branch.reports').where('report_id', '=', Number(id)).selectAll().executeTakeFirst();
  if (!report) return json(404, { message: 'Report not found' });

  const key = keyFromObjectUrl(report.object_url);
  if (!key || !key.startsWith(reportKeyPrefix(report.project_id))) {
    return json(409, { message: 'Report is not stored in the reports bucket' });
  }

  const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn: DOWNLOAD_URL_TTL_SECONDS });

  return json(200, { downloadUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS });
};

export const getReport: RouteHandler = async ({ params, path, method }) => {
  const notFound = notFoundUnlessNumericId(params.id, path, method);
  if (notFound) return notFound;
  const id = params.id;

  const report = await db.selectFrom('branch.reports').where('report_id', '=', Number(id)).selectAll().executeTakeFirst();
  if (!report) return json(404, { message: 'Report not found' });

  return json(200, { ok: true, route: 'GET /reports/{id}', pathParams: { id }, body: report });
};

export const deleteReport: RouteHandler = async ({ params, path, method }) => {
  const notFound = notFoundUnlessNumericId(params.id, path, method);
  if (notFound) return notFound;
  const id = params.id;

  const report = await db.selectFrom('branch.reports').where('report_id', '=', Number(id)).selectAll().executeTakeFirst();
  if (!report) return json(404, { message: 'Report not found' });

  const deleted = await db.deleteFrom('branch.reports').where('report_id', '=', Number(id)).execute();
  if (!deleted[0] || deleted[0].numDeletedRows === 0n) {
    return json(404, { message: 'Report not found' });
  }

  // After the row, never before: if the file went first and this delete
  // failed, the report would be gone with a row still pointing at it.
  const fileDeleted = await deleteReportObject(report.object_url);

  return json(200, { ok: true, route: 'DELETE /reports/{id}', pathParams: { id }, fileDeleted });
};

async function withSizes<T extends { object_url: string }>(rows: T[]) {
  const sizes = await Promise.all(rows.map((r) => getObjectSize(r.object_url)));
  return rows.map((r, i) => ({ ...r, file_size: sizes[i] }));
}