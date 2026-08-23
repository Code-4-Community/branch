import type { Route } from '@branch/lambda-http';
import { listProjects, getProject, createProject, updateProject, deleteProject } from './controllers/projects';
import { getDashboard, getOverview } from './controllers/dashboard';
import { getMembers, getAssignableStaff } from './controllers/members';
import { getProjectDonors } from './controllers/donors';
import { getProjectExpenditures } from './controllers/expenditures';

// >>> ROUTES-START (do not remove this marker)
export const routes: Route[] = [
  { method: 'GET', pattern: '/projects/dashboard', handler: getDashboard },
  { method: 'GET', pattern: '/projects/:id/members', handler: getMembers },
  // Declared before /projects/:id: that pattern now requires a numeric
  // segment, but keeping the literal path first also documents that
  // "assignable-staff" is not a project id.
  { method: 'GET', pattern: '/projects/assignable-staff', handler: getAssignableStaff },
  { method: 'GET', pattern: '/projects', handler: listProjects },
  // One call for the whole detail page: the header, the funding donut, the
  // staff column and the expenses table previously needed three round trips.
  { method: 'GET', pattern: '/projects/:id/overview', handler: getOverview },
  { method: 'GET', pattern: '/projects/:id/donors', handler: getProjectDonors },
  { method: 'GET', pattern: '/projects/:id', handler: getProject },
  { method: 'PUT', pattern: '/projects/:id', handler: updateProject },
  { method: 'DELETE', pattern: '/projects/:id', handler: deleteProject },
  { method: 'POST', pattern: '/projects', handler: createProject },
  { method: 'GET', pattern: '/projects/:id/expenditures', handler: getProjectExpenditures },
];
// <<< ROUTES-END
