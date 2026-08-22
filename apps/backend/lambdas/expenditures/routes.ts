import type { Route } from '@branch/lambda-http';
import {
  getExpenditures,
  createExpenditure,
  getUploadUrl,
  getReceipt,
  getExpenditureById,
  deleteExpenditure,
  patchExpenditureStatus,
} from './controllers/expenditures';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/expenditures', handler: getExpenditures },
  { method: 'POST', pattern: '/expenditures', handler: createExpenditure },
  // /expenditures/upload-url must precede /expenditures/:id — both are one segment.
  { method: 'GET', pattern: '/expenditures/upload-url', handler: getUploadUrl },
  { method: 'GET', pattern: '/expenditures/:id/receipt', handler: getReceipt },
  { method: 'GET', pattern: '/expenditures/:id', handler: getExpenditureById },
  { method: 'DELETE', pattern: '/expenditures/:id', handler: deleteExpenditure },
  { method: 'PATCH', pattern: '/expenditures/:id/status', handler: patchExpenditureStatus },
  // <<< ROUTES-END
];
