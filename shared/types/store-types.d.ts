/**
 * The single declaration of the @branch/store write DTOs. The store re-exports
 * these rather than declaring its own copy.
 *
 * Deliberately not `Insertable<DB['branch.x']>`: a caller should not have to
 * know Kysely's generics to write a row, and generated columns (ids, created_at)
 * are absent here so they cannot be set by accident.
 *
 * `number | string` on money columns mirrors NUMERIC's insert type -- the value
 * comes back out as a string, so both are accepted going in.
 */

export interface NewExpenditure {
  project_id: number;
  amount: number | string;
  entered_by?: number | null;
  category?: string | null;
  description?: string | null;
  status?: string;
  receipt_url?: string | null;
  spent_on?: Date | string;
  admin_notes?: string | null;
}

/** Every column an expenditure update may reach. Routes narrow this further. */
export interface ExpenditureEdit {
  amount?: number | string;
  category?: string | null;
  description?: string | null;
  receipt_url?: string | null;
  spent_on?: Date | string;
  status?: string;
  admin_notes?: string | null;
}

export interface NewDonation {
  donor_id: number;
  project_id: number;
  amount: number | string;
  donated_at?: Date | string | null;
}

export interface NewDonor {
  organization: string;
  contact_name?: string | null;
  contact_email?: string | null;
}

export interface NewReport {
  project_id: number;
  title: string;
  object_url: string;
  report_type?: string;
}

export interface NewProject {
  name: string;
  description: string;
  total_budget?: number | string | null;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
  currency?: string | null;
}

export interface ProjectEdit {
  name?: string;
  description?: string;
  total_budget?: number | string | null;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
  currency?: string | null;
}

export interface NewUser {
  email: string;
  name: string;
  cognito_sub?: string | null;
  is_admin?: boolean | null;
  profile_image?: string | null;
}

export interface UserEdit {
  email?: string;
  name?: string;
  cognito_sub?: string | null;
  is_admin?: boolean | null;
  profile_image?: string | null;
}

/** One roster entry. An absent role keeps whatever the member already held. */
export interface ProjectMemberInput {
  user_id: number;
  role?: string | null;
}
