-- A donor may give to the same project more than once. No IF EXISTS: a wrong name must fail the deploy, not no-op.
ALTER TABLE project_donations DROP CONSTRAINT project_donations_donor_id_project_id_key;
