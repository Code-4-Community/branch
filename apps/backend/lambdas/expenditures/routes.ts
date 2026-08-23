import type { Route } from '@branch/lambda-http';
import {
  getExpenditures,
  createExpenditure,
  getUploadUrl,
  getReceipt,
  getExpenditureById,
  updateExpenditure,
  deleteExpenditure,
  patchExpenditureStatus,
} from './controllers/expenditures';

/**
 * `access: 'authenticated'` marks the routes whose real decision needs the row
 * (or the request body) and is therefore made inside the controller — see
 * `expense:view` / `expense:update` there. Only `expense:review` is coarse
 * enough to settle at the routing layer.
 */
export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/expenditures', permission: 'expenses:view', handler: getExpenditures },
  { method: 'POST', pattern: '/expenditures', access: 'authenticated', handler: createExpenditure },
  // /expenditures/upload-url must precede /expenditures/:id — both are one segment.
  { method: 'GET', pattern: '/expenditures/upload-url', access: 'authenticated', handler: getUploadUrl },
  { method: 'GET', pattern: '/expenditures/:id/receipt', access: 'authenticated', handler: getReceipt },
  { method: 'GET', pattern: '/expenditures/:id', access: 'authenticated', handler: getExpenditureById },
  { method: 'PATCH', pattern: '/expenditures/:id', access: 'authenticated', handler: updateExpenditure },
  { method: 'DELETE', pattern: '/expenditures/:id', access: 'authenticated', handler: deleteExpenditure },
  { method: 'PATCH', pattern: '/expenditures/:id/status', permission: 'expense:review', handler: patchExpenditureStatus },
  // <<< ROUTES-END
];
