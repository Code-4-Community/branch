import type { Route } from '@branch/lambda-http';
import { listProjects, getProject, createProject, updateProject, deleteProject } from './controllers/projects';
import { getDashboard, getOverview } from './controllers/dashboard';
import { getMembers, getAssignableStaff } from './controllers/members';
import { getProjectDonors } from './controllers/donors';
import { getProjectExpenditures } from './controllers/expenditures';

/**
 * `access: 'authenticated'` marks routes whose real gate is `project:view`,
 * which needs the id and is therefore applied in the controller through
 * `requireVisibleProject`. Everything settleable without a record states its
 * permission here and is enforced before the controller runs.
 */
// >>> ROUTES-START (do not remove this marker)
export const routes: Route[] = [
  { method: 'GET', pattern: '/projects/dashboard', permission: 'dashboard:view', handler: getDashboard },
  { method: 'GET', pattern: '/projects/:id/members', access: 'authenticated', handler: getMembers },
  // Must stay above /projects/:id. `matchPattern` has no numeric constraint on
  // `:param`, so declaration order is the only thing keeping this literal path
  // from being read as a project id.
  { method: 'GET', pattern: '/projects/assignable-staff', permission: 'staff:list', handler: getAssignableStaff },
  // The list itself is open to any session; the rows are scoped to membership.
  { method: 'GET', pattern: '/projects', permission: 'projects:view', handler: listProjects },
  // One call for the whole detail page: the header, the funding donut, the
  // staff column and the expenses table previously needed three round trips.
  { method: 'GET', pattern: '/projects/:id/overview', access: 'authenticated', handler: getOverview },
  { method: 'GET', pattern: '/projects/:id/donors', access: 'authenticated', handler: getProjectDonors },
  { method: 'GET', pattern: '/projects/:id', access: 'authenticated', handler: getProject },
  { method: 'PUT', pattern: '/projects/:id', permission: 'project:update', handler: updateProject },
  { method: 'DELETE', pattern: '/projects/:id', permission: 'project:delete', handler: deleteProject },
  { method: 'POST', pattern: '/projects', permission: 'project:create', handler: createProject },
  { method: 'GET', pattern: '/projects/:id/expenditures', access: 'authenticated', handler: getProjectExpenditures },
];
// <<< ROUTES-END
