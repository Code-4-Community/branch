import type { Route } from '@branch/lambda-http';
import { getDonors, createDonor, deleteDonor } from './controllers/donors';
import { getDonations, createDonation, deleteDonation } from './controllers/donations';

export const routes: Route[] = [
  // >>> ROUTES-START (do not remove this marker)
  { method: 'GET', pattern: '/donors', handler: getDonors },
  { method: 'GET', pattern: '/donors/donations', handler: getDonations },
  { method: 'POST', pattern: '/donors/donations', handler: createDonation },
  { method: 'POST', pattern: '/donors', handler: createDonor },
  { method: 'DELETE', pattern: '/donors/:id', handler: deleteDonor },
  { method: 'DELETE', pattern: '/donors/donations/:id', handler: deleteDonation },
  // <<< ROUTES-END
];
