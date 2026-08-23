import type { Route } from '@branch/lambda-http';
import { getDonors, createDonor, deleteDonor } from './controllers/donors';
import { getDonations, createDonation, deleteDonation } from './controllers/donations';

/**
 * Every route declares its gate; the `Route` union makes omitting one a type
 * error. `permission` is enforced by `dispatch` before the controller runs, so
 * a controller only ever handles the record-level part of the decision.
 */
export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/donors', permission: 'donors:view', handler: getDonors },
  // The donations list is open to any session and scoped to the caller's
  // projects inside the controller — unlike the donor roster above.
  { method: 'GET', pattern: '/donors/donations', permission: 'donations:view', handler: getDonations },
  { method: 'POST', pattern: '/donors/donations', permission: 'donations:create', handler: createDonation },
  { method: 'POST', pattern: '/donors', permission: 'donors:create', handler: createDonor },
  { method: 'DELETE', pattern: '/donors/:id', permission: 'donors:delete', handler: deleteDonor },
  { method: 'DELETE', pattern: '/donors/donations/:id', permission: 'donations:delete', handler: deleteDonation },
  // <<< ROUTES-END
];
