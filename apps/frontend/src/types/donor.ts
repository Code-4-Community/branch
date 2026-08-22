/** A row of `branch.donors`, as returned by `GET /donors`. */
export interface Donor {
  donor_id: number;
  organization: string;
  contact_name: string | null;
  contact_email: string | null;
  created_at?: string | null;
}

/**
 * A row of `branch.project_donations`, as returned by `GET /donors/donations`.
 *
 * The endpoint returns the raw row — no donor or project names — so the list
 * views join it against `/donors` and `/projects` on the client.
 */
export interface Donation {
  donation_id: number;
  donor_id: number;
  project_id: number;
  amount: string;
  donated_at: string | null;
}
