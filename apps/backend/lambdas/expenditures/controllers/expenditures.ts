import type { RouteHandler } from '@branch/lambda-http';
import { json, requireAuth } from '@branch/lambda-http';
import { authenticateRequest } from '../auth';
import { ExpenditureValidationUtils } from '../validation-utils';
import * as expendituresService from '../services/expenditures';

function invalidId(id: string): boolean {
  return !/^\d+$/.test(id) || parseInt(id, 10) < 1;
}

// GET /expenditures
export const getExpenditures: RouteHandler = async ({ event }) => {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated) {
    return json(401, { message: 'Authentication required' });
  }

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

  if (page && limit) {
    const offset = (page - 1) * limit;
    const totalItems = await expendituresService.countExpenditures(projectId);
    const totalPages = Math.ceil(totalItems / limit);
    const expenditures = await expendituresService.queryExpenditures(projectId, { limit, offset });

    return json(200, {
      data: expenditures,
      pagination: { page, limit, totalItems, totalPages },
    });
  }

  const expenditures = await expendituresService.queryExpenditures(projectId);
  return json(200, { data: expenditures });
};

// POST /expenditures
export const createExpenditure: RouteHandler = async ({ event }) => {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }

  const { user } = authContext;
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  const validationResult = ExpenditureValidationUtils.validateExpenditureInput(body);
  if (validationResult instanceof Error) {
    return json(400, { message: validationResult.message });
  }

  const { projectID, amount, category, description, status, receiptUrl, spentOn } = validationResult;

  // Authorize: must be global admin, or Director/Admin on this project
  if (!user.isAdmin) {
    const membership = await expendituresService.findMembership(projectID, user.userId!);
    if (!membership || !['Director', 'Admin'].includes(membership.role)) {
      return json(403, { message: 'Unable to create expenditure for this project' });
    }
  }

  const project = await expendituresService.findProjectById(projectID);
  if (!project) {
    return json(404, { message: 'Project not found' });
  }

  try {
    await expendituresService.insertExpenditure({
      project_id: projectID,
      entered_by: user.userId!,
      amount,
      category: category ?? null,
      description: description ?? null,
      status,
      receipt_url: receiptUrl ?? null,
      spent_on: spentOn ? new Date(spentOn) : new Date(),
    });
  } catch (err) {
    console.error('Database insert error:', err);
    return json(500, { message: 'Failed to create expenditure' });
  }

  return json(201, {
    ok: true,
    route: 'POST /expenditures',
    body: {
      projectID,
      enteredBy: user.userId!,
      amount,
      category: category ?? null,
      description: description ?? null,
      status,
      receiptUrl: receiptUrl ?? null,
      spentOn: spentOn ?? new Date().toISOString().split('T')[0],
    },
  });
};

// GET /expenditures/upload-url — presigned PUT for a receipt PDF.
export const getUploadUrl: RouteHandler = async ({ event }) => {
  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }
  const { user } = authContext;

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

  // Same authorization as POST /expenditures: you may only attach a receipt
  // to a project you are allowed to file an expenditure against.
  if (!user.isAdmin) {
    const membership = await expendituresService.findMembership(projectId, user.userId!);
    if (!membership || !['Director', 'Admin'].includes(membership.role)) {
      return json(403, { message: 'Unable to upload a receipt for this project' });
    }
  }

  const { uploadUrl, objectUrl } = await expendituresService.presignUploadUrl(projectId, fileName);
  return json(200, { uploadUrl, objectUrl });
};

// GET /expenditures/{id}/receipt — presigned GET so the receipt can be read
// without the bucket being public.
export const getReceipt: RouteHandler = async ({ event, params }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }
  const { user } = authContext;

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) return json(404, { message: 'Expenditure not found' });

  // Mirrors GET /expenditures/{id}: admin, or any membership on the project.
  if (!user.isAdmin) {
    const membership = await expendituresService.findMembership(expenditure.project_id, user.userId!);
    if (!membership) {
      return json(403, { message: 'Unable to view this receipt' });
    }
  }

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
export const getExpenditureById: RouteHandler = async ({ event, params }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }
  const { user } = authContext;

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) return json(404, { message: 'Expenditure not found' });

  if (!user.isAdmin) {
    const membership = await expendituresService.findMembership(expenditure.project_id, user.userId!);
    if (!membership) {
      return json(403, { message: 'Unable to view this expenditure' });
    }
  }

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
      adminNotes: expenditure.admin_notes,
      receiptUrl: expenditure.receipt_url,
      spent_on: expenditure.spent_on,
      createdAt: expenditure.created_at,
    },
  });
};

// DELETE /expenditures/{id}
export const deleteExpenditure: RouteHandler = async ({ event, params }) => {
  const { id } = params;
  if (invalidId(id)) {
    return json(400, { message: 'id must be a positive integer' });
  }

  const authContext = await authenticateRequest(event);
  if (!authContext.isAuthenticated || !authContext.user) {
    return json(401, { message: 'Authentication required' });
  }
  const { user } = authContext;

  const expenditure = await expendituresService.findExpenditureById(Number(id));
  if (!expenditure) {
    return json(404, { message: 'Expenditure not found' });
  }

  // (mirrors POST endpoint) Authorize: must be global admin, or Director/Admin on this expenditure's project
  if (!user.isAdmin) {
    const membership = await expendituresService.findMembership(expenditure.project_id, user.userId!);
    if (!membership || !['Director', 'Admin'].includes(membership.role)) {
      return json(403, { message: 'Unable to delete this expenditure' });
    }
  }

  const numDeletedRows = await expendituresService.deleteExpenditureById(Number(id));
  if (numDeletedRows === 0n) {
    return json(404, { message: 'Expenditure not found' });
  }

  // After the row, never before: if the object went first and the delete
  // below failed, the receipt would be gone with a row still pointing at it.
  const receiptDeleted = await expendituresService.deleteReceiptObject(expenditure.receipt_url);

  return json(200, { ok: true, route: 'DELETE /expenditures/{id}', pathParams: { id }, receiptDeleted });
};

// PATCH /expenditures/{id}/status — approve/decline (admin only)
export const patchExpenditureStatus: RouteHandler = async ({ event, params }) => {
  const authContext = await authenticateRequest(event);
  const authError = requireAuth(authContext, 'ADMIN');
  if (authError) return authError;

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
