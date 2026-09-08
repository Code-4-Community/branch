-- 20260823054531_add_followup_indexes
--
-- Every pending migration runs inside a SINGLE transaction, with
-- search_path = branch, public -- so table names can be unqualified, and
-- CREATE INDEX CONCURRENTLY / VACUUM will not work here.
--
-- This migration is applied to PRODUCTION automatically when the PR merges,
-- BEFORE the new lambda code is deployed. It must be safe for the code that is
-- live right now: additive changes only. See apps/backend/db/README.md for the
-- expand/contract rules that destructive changes need.
--
-- Forward-only: there is no rollback. Fix a mistake with a new migration, and
-- never edit a migration that has been merged -- someone has already run it.
-- Do not use IF NOT EXISTS: you want a failure, not silent drift.
--
--
-- Follow-up to 20260812022651, which indexed the foreign keys and the date
-- sorts. These are the three access patterns it left as full scans: two sorts
-- and one filter. Dropping an index the composite below supersedes is not a
-- schema change the live code can see, so this stays additive in practice.

-- GET /projects/assignable-staff sorts the entire users table by name, with no
-- WHERE clause at all, on every open of the project-edit form -- see
-- getAssignableStaff in lambdas/projects/controllers/members.ts. The project
-- overview sorts u.name too (getOverview in controllers/dashboard.ts), but only
-- over one project's members, so it is the unfiltered roster that pays here.
CREATE INDEX users_name_idx ON users (name);

-- expenditures.status is filtered by the four dashboard aggregates
-- (getDashboard in controllers/dashboard.ts), by loadProjectAggregates
-- (services/projects.ts) and by the report generator (reports/report-service.ts).
-- Three of those dashboard aggregates also bound spent_on to one year, so today
-- they can only reach for expenditures_spent_on_idx and re-check status on every
-- row in the range; status leading makes it a single range scan instead. The
-- project_id-filtered callers keep using expenditures_project_id_spent_on_idx.
CREATE INDEX expenditures_status_spent_on_idx
    ON expenditures (status, spent_on);

-- GET /donors/donations filters project_id down to the caller's visible
-- projects, then sorts donation_id (lambdas/donors/controllers/donations.ts).
-- The single-column index serves the filter but leaves the sort as a top-N over
-- the whole match set; the composite walks it already ordered.
CREATE INDEX project_donations_project_id_donation_id_idx
    ON project_donations (project_id, donation_id);

-- Redundant once the composite exists: same leading column, strict prefix. Safe
-- to drop because it backs no constraint -- 20260812022651 created it as a plain
-- CREATE INDEX. The table's UNIQUE (donor_id, project_id) is a separate index
-- and is not touched.
DROP INDEX project_donations_project_id_idx;
