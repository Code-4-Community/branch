-- 20260812022651_add_access_pattern_indexes
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
-- Before this migration the schema had ELEVEN indexes, every one of them a
-- primary key or a UNIQUE constraint, and not one on a foreign key. Postgres
-- does not index a referencing column for you. So every lookup by project_id,
-- every list ordered by a date, and every ON DELETE CASCADE was a sequential
-- scan of the whole child table.
--
-- Adding an index is pure expand: it changes no column, breaks no live INSERT,
-- and only ever makes the currently deployed code faster.
--
-- Indexes are written ASC even where the query sorts DESC. Both ORDER BY
-- columns here are NOT NULL, so Postgres reads the same index backwards
-- ("Index Scan Backward") and gets the ordering for free; a DESC index would
-- buy nothing and only matters for mixed-direction multi-column sorts.

-- expenditures.project_id -> the single hottest access path in the app.
-- Serves the project-filtered expenditure list and its COUNT, the project
-- detail page's expenditure tab, the report generator's expenditure section,
-- and the FK check behind DELETE projects. Composite with spent_on because
-- every one of those list queries also does ORDER BY spent_on DESC -- the
-- second column turns a top-N sort over the whole table into an ordered walk
-- of the matching rows only.
CREATE INDEX expenditures_project_id_spent_on_idx
    ON expenditures (project_id, spent_on);

-- The unfiltered expenditure list (GET /expenditures with no projectId) sorts
-- the entire table by spent_on to return one page. This is also the query
-- behind the new admin approve/deny review queue, which fetches the list and
-- filters to `pending` client-side -- so it pays the full sort on every open.
CREATE INDEX expenditures_spent_on_idx
    ON expenditures (spent_on);

-- expenditures.entered_by is never filtered on directly, but it is a FK with
-- ON DELETE SET NULL: deleting one user rewrote every matching row only after
-- sequentially scanning all of expenditures to find them.
CREATE INDEX expenditures_entered_by_idx
    ON expenditures (entered_by);

-- reports.project_id + date_created: same shape as expenditures -- filtered
-- list, its COUNT, and the DELETE projects cascade, all sorted date_created
-- DESC.
CREATE INDEX reports_project_id_date_created_idx
    ON reports (project_id, date_created);

-- The unfiltered report list, sorted date_created DESC.
CREATE INDEX reports_date_created_idx
    ON reports (date_created);

-- project_memberships.user_id. The UNIQUE constraint is (project_id, user_id),
-- so it cannot serve a lookup keyed on user_id alone -- and that is exactly
-- what GET /projects does for every non-admin user to find the projects they
-- belong to. It is the landing page of the app. Also the DELETE users cascade.
CREATE INDEX project_memberships_user_id_idx
    ON project_memberships (user_id);

-- project_donations.project_id. Same wrong-leading-column problem: UNIQUE is
-- (donor_id, project_id). Serves GET /projects/{id}/donors, the report
-- generator's donation section, and the DELETE projects cascade.
CREATE INDEX project_donations_project_id_idx
    ON project_donations (project_id);
