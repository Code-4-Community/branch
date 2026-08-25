import type { RouteHandler } from '@branch/lambda-http';
import { json, requirePermission, serverError } from '@branch/lambda-http';
import { can } from '@branch/rbac';
import type { ExpenseResource } from '@branch/rbac';
import { ExpenditureValidationUtils } from '../validation-utils';
import * as expendituresService from '../services/expenditures';
import { expenditureScope } from '../services/scope';

// Authentication and each route's declared permission are enforced by dispatch
// before any of these run — see routes.ts. What is left here is the part the
// routing layer cannot do: checks that need the row in hand.

function invalidId(id: string): boolean {
  return !/^\d+$/.test(id) || parseInt(id, 10) < 1;
}

/** The policy's view of an expenditure row. */
function resourceOf(expenditure: {
  project_id: number;
  entered_by: number | null;
  status: string;
}): ExpenseResource {
  return {
    projectId: expenditure.project_id,
    enteredBy: expenditure.entered_by,
    status: expenditure.status,
  };
}

// GET /expenditures
export const getExpenditures: RouteHandler = async ({ event, auth }) => {
  const queryParams = event.queryStringParameters || {};
  const pageStr = queryParams.page as string | undefined;
  const limitStr = queryParams.limit as string | undefined;
  const projectIdStr = queryParams.projectId as string | undefined;

  if (pageStr !== undefined && (!/^\d+$/.test(pageStr) || parseInt(pageStr, 10) < 1)) {
    return json(400, { message: 'page must be a positive integer' });
  }

  if (limitStr !== undefined && (!/^\d+$/.test(limitStr) || parseInt(limitStr, 10) < 1)) {
    return json(400, { message: 'limit must be a positive integer' });
  }

  if (projectIdStr !== undefined && (!/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1)) {
    return json(400, { message: 'projectId must be a positive integer' });
  }

  const page = pageStr ? parseInt(pageStr, 10) : null;
  const limit = limitStr ? parseInt(limitStr, 10) : null;
  const projectId = projectIdStr ? parseInt(projectIdStr, 10) : null;

  // Narrowing, never widening: an explicit ?projectId= filters within the
  // caller's scope rather than escaping it, so asking for someone else's
  // project returns an empty list instead of a 403 that confirms it exists.
  const scope = expenditureScope(auth.subject);

  if (page && limit) {
    const offset = (page - 1) * limit;
    const totalItems = await expendituresService.countExpenditures(projectId, scope);
    const totalPages = Math.ceil(totalItems / limit);
    const expenditures = await expendituresService.queryExpenditures(projectId, scope, { limit, offset });

    return json(200, {
      data: redactAdminNotes(expenditures, auth.subject),
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const expenditures = await expendituresService.queryExpenditures(projectId, scope);
  return json(200, { data: redactAdminNotes(expenditures, auth.subject) });
};

/**
 * Admin notes are an internal reviewer channel, so they never leave the API for
 * a non-admin. Stripped server-side rather than merely hidden in the table —
 * the column was previously in every list payload.
 */
function redactAdminNotes<T extends { admin_notes?: string | null }>(
  rows: T[],
  subject: Parameters<typeof can>[0],
): T[] {
  if (can(subject, 'expense:viewAdminNotes')) return rows;
  return rows.map(({ ...row }) => {
    delete row.admin_notes;
    return row;
  });
}

// POST /expenditures
export const createExpenditure: RouteHandler = async ({ event, auth }) => {
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  const validationResult = ExpenditureValidationUtils.validateExpenditureInput(body);
  if (validationResult instanceof Error) {
    return json(400, { message: validationResult.message });
  }

  const { projectID, amount, category, description, status, receiptUrl, spentOn } = validationResult;

  const denied = requirePermission(auth.subject, 'expense:create', { projectId: projectID });
  if (denied) return denied;

  // A submitter cannot file an already-approved expense. The status field is
  // still accepted so an admin can record a decision at creation time.
  const effectiveStatus = can(auth.subject, 'expense:review') ? status : 'pending';

  const project = await expendituresService.findProjectById(projectID);
  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  try {
    await expendituresService.insertExpenditure({
      project_id: projectID,
      entered_by: auth.subject.userId!,
      amount,
      category: category ?? null,
      description: description ?? null,
      status: effectiveStatus,
      receipt_url: receiptUrl ?? null,
      spent_on: spentOn ? new Date(spentOn) : new Date(),
    });
  } catch (err) {
    return serverError(err, 'Failed to create expenditure');
  }

  return json(201, {
    ok: true,
    route: 'POST /expenditures',
    body: {
      projectID,
      enteredBy: auth.subject.userId!,
      amount,
      category: category ?? null,
      description: description ?? null,
      status: effectiveStatus,
      receiptUrl: receiptUrl ?? null,
      spentOn: spentOn ?? new Date().toISOString().split('T')[0],
    },
  });
};

// GET /expenditures/upload-url — presigned PUT for a receipt PDF.
export const getUploadUrl: RouteHandler = async ({ event, auth }) => {
  const queryParams = event.queryStringParameters || {};
  const { fileName, projectId: projectIdStr } = queryParams;

  if (!fileName || typeof fileName !== 'string') {
    return json(400, { message: 'fileName is required' });
  }
  if (fileName.split('.').pop()?.toLowerCase() !== 'pdf') {
    return json(400, { message: 'Only PDF receipts are supported' });
  }
  if (!projectIdStr || !/^\d+$/.test(projectIdStr) || parseInt(projectIdStr, 10) < 1) {
    return json(400, { message: 'projectId must be a positive integer' });
  }
  const projectId = parseInt(projectIdStr, 10);

  // Same gate as POST /expenditures: you may only attach a receipt to a project
  // you are allowed to file against.
  const denied = requirePermission(auth.subject, 'expense:uploadReceipt', { projectId });
  if (denied) return denied;

  const { uploadUrl, objectUrl } = await expendituresService.presignUploadUrl(projectId, fileName);
  return json(200, { uploadUrl, objectUrl });
};

// GET /expenditures/{id}/receipt — presigned GET so the receipt can be read
// without the bucket being public.
export const getReceipt: RouteHandler = async ({ params, auth }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) return json(404, { message: 'Expenditure not found' });

  const denied = requirePermission(auth.subject, 'expense:viewReceipt', resourceOf(expenditure));
  if (denied) return denied;

  if (!expenditure.receipt_url) {
    return json(404, { message: 'Expenditure has no receipt' });
  }

  const key = expendituresService.receiptKeyFromUrl(expenditure.receipt_url);
  if (!key) {
    return json(422, { message: 'Receipt is not stored in the receipts bucket' });
  }

  const downloadUrl = await expendituresService.presignReceiptDownload(key);

  return json(200, {
    downloadUrl,
    fileName: key.split('/').pop(),
  });
};

// GET /expenditures/{id}
export const getExpenditureById: RouteHandler = async ({ params, auth }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) return json(404, { message: 'Expenditure not found' });

  const denied = requirePermission(auth.subject, 'expense:view', resourceOf(expenditure));
  if (denied) return denied;

  // "Submitted By" in the review modal needs a name, not an id.
  const submitter = expenditure.entered_by
    ? await expendituresService.findUserName(expenditure.entered_by)
    : undefined;

  const projectName = await expendituresService.findProjectName(expenditure.project_id);

  return json(200, {
    ok: true,
    route: 'GET /expenditures/{id}',
    pathParams: { id },
    body: {
      expenditureId: expenditure.expenditure_id,
      projectId: expenditure.project_id,
      projectName: projectName ?? null,
      enteredBy: expenditure.entered_by,
      submittedByName: submitter ?? null,
      amount: expenditure.amount,
      category: expenditure.category,
      description: expenditure.description,
      status: expenditure.status,
      // Withheld rather than nulled would look like "no notes"; the key is
      // absent so a client can tell it was not shown.
      ...(can(auth.subject, 'expense:viewAdminNotes')
        ? { adminNotes: expenditure.admin_notes }
        : {}),
      receiptUrl: expenditure.receipt_url,
      spent_on: expenditure.spent_on,
      createdAt: expenditure.created_at,
    },
  });
};

// PATCH /expenditures/{id} — the submitter's own edit.
export const updateExpenditure: RouteHandler = async ({ event, params, auth }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) return json(404, { message: 'Expenditure not found' });

  // Ordered so someone who cannot see the row gets 404, not 403 — a 403 here
  // would confirm the expense exists.
  const invisible = requirePermission(auth.subject, 'expense:view', resourceOf(expenditure));
  if (invisible) return json(404, { message: 'Expenditure not found' });

  const denied = requirePermission(auth.subject, 'expense:update', resourceOf(expenditure));
  if (denied) return denied;

  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};
  const update = ExpenditureValidationUtils.validateExpenditureUpdate(body);
  if (update instanceof Error) {
    return json(400, { message: update.message });
  }

  await expendituresService.updateExpenditure(Number(id), {
    ...(update.amount !== undefined ? { amount: update.amount } : {}),
    ...(update.category !== undefined ? { category: update.category } : {}),
    ...(update.description !== undefined ? { description: update.description } : {}),
    ...(update.receiptUrl !== undefined ? { receipt_url: update.receiptUrl } : {}),
    ...(update.spentOn !== undefined ? { spent_on: new Date(update.spentOn) } : {}),
  });

  const updated = await expendituresService.findExpenditureById(Number(id));

  return json(200, {
    ok: true,
    route: 'PATCH /expenditures/{id}',
    pathParams: { id },
    body: {
      expenditureId: updated!.expenditure_id,
      projectId: updated!.project_id,
      amount: updated!.amount,
      category: updated!.category,
      description: updated!.description,
      status: updated!.status,
      receiptUrl: updated!.receipt_url,
      spent_on: updated!.spent_on,
    },
  });
};

// DELETE /expenditures/{id}
export const deleteExpenditure: RouteHandler = async ({ params, auth }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) {
    return json(404, { message: 'Expenditure not found' });
  }

  const invisible = requirePermission(auth.subject, 'expense:view', resourceOf(expenditure));
  if (invisible) return json(404, { message: 'Expenditure not found' });

  const denied = requirePermission(auth.subject, 'expense:delete', resourceOf(expenditure));
  if (denied) return denied;

  const numDeletedRows = await expendituresService.deleteExpenditureById(Number(id));
  if (numDeletedRows === 0n) {
    return json(404, { message: 'Expenditure not found' });
  }

  // After the row, never before: if the object went first and the delete
  // below failed, the receipt would be gone with a row still pointing at it.
  const receiptDeleted = await expendituresService.deleteReceiptObject(expenditure.receipt_url);

  return json(200, { ok: true, route: 'DELETE /expenditures/{id}', pathParams: { id }, receiptDeleted });
};

// PATCH /expenditures/{id}/status — approve/decline. `expense:review` on the
// route makes this admin-only.
export const patchExpenditureStatus: RouteHandler = async ({ event, params }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  const statusResult = ExpenditureValidationUtils.validateApprovalStatus(body.status);
  if (statusResult instanceof Error) {
    return json(400, { message: statusResult.message });
  }

  const adminNotesResult = ExpenditureValidationUtils.validateAdminNotes(body.adminNotes);
  if (adminNotesResult instanceof Error) {
    return json(400, { message: adminNotesResult.message });
  }

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) {
    return json(404, { message: 'Expenditure not found' });
  }

  await expendituresService.updateExpenditureStatus(Number(id), statusResult, adminNotesResult);
  const updated = await expendituresService.findExpenditureById(Number(id));

  return json(200, {
    ok: true,
    route: 'PATCH /expenditures/{id}/status',
    pathParams: { id },
    body: {
      expenditureId: updated!.expenditure_id,
      status: updated!.status,
      adminNotes: updated!.admin_notes,
    },
  });
};
