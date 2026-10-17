-- Replaces the donor_id-leading UNIQUE index dropped next; removeDonor filters on donor_id.
CREATE INDEX ${async} project_donations_donor_id_idx ON project_donations (donor_id);
