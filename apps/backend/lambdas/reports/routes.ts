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

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'POST', pattern: '/reports/generate', handler: generateReport },
  { method: 'GET', pattern: '/reports', handler: listReports },
  { method: 'GET', pattern: '/reports/upload-url', handler: getUploadUrl },
  { method: 'POST', pattern: '/reports', handler: createReport },
  { method: 'GET', pattern: '/reports/:id/download', handler: downloadReport },
  { method: 'GET', pattern: '/reports/:id', handler: getReport },
  { method: 'DELETE', pattern: '/reports/:id', handler: deleteReport },
  // <<< ROUTES-END
];
