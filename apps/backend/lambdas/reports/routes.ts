import type { Route } from '@branch/lambda-http';
import {
  generateReport,
  listReports,
  getUploadUrl,
  createReport,
  downloadReport,
  getReport,
  deleteReport,
} from './controllers/reports';

/**
 * Reports are admin-only in every direction — reading included. There is no
 * project-scoped arm here, so nothing about a report is decided in a
 * controller.
 */
export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'POST', pattern: '/reports/generate', permission: 'reports:generate', handler: generateReport },
  { method: 'GET', pattern: '/reports', permission: 'reports:view', handler: listReports },
  { method: 'GET', pattern: '/reports/upload-url', permission: 'reports:create', handler: getUploadUrl },
  { method: 'POST', pattern: '/reports', permission: 'reports:create', handler: createReport },
  { method: 'GET', pattern: '/reports/:id/download', permission: 'reports:view', handler: downloadReport },
  { method: 'GET', pattern: '/reports/:id', permission: 'reports:view', handler: getReport },
  { method: 'DELETE', pattern: '/reports/:id', permission: 'reports:delete', handler: deleteReport },
  // <<< ROUTES-END
];
